import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthUser, UserRole } from '@art-garage/shared';
import { PrismaService } from '../prisma/prisma.service';

interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
}

/** TTL кеша existence-чека юзера. Короткий чтобы удаление/смена роли подхватывались быстро,
 *  но достаточно длинный чтобы убрать ~95% хитов в БД на горячем API. */
const USER_CACHE_TTL_MS = 30_000;

interface CacheEntry {
  user: AuthUser;
  expiresAt: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  /** In-memory кеш: userId → AuthUser + ttl. Под нагрузкой каждый запрос делал findUnique,
   *  под нагрузкой это забивало Prisma connection pool (см. инцидент 2026-05-15). */
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not set');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * Валидируем токен И проверяем что пользователь существует в БД.
   * Без этого JWT остаётся валидным после удаления пользователя или reset'а БД,
   * но любая операция с FK userId падает на insert.
   */
  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (!payload?.sub) {
      throw new UnauthorizedException();
    }

    const now = Date.now();
    const cached = this.cache.get(payload.sub);
    if (cached && cached.expiresAt > now) {
      return cached.user;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!user) {
      this.cache.delete(payload.sub);
      throw new UnauthorizedException('User not found');
    }

    this.cache.set(payload.sub, { user, expiresAt: now + USER_CACHE_TTL_MS });
    // Базовая чистка чтобы кеш не рос бесконечно при истечении ttl и забытых ключах.
    if (this.cache.size > 1000) {
      for (const [k, v] of this.cache) {
        if (v.expiresAt <= now) this.cache.delete(k);
      }
    }
    return user;
  }

  /** Дёрнуть из мест где юзер был обновлён/удалён (роль, имя, бан). Без вызова кеш отстанет на TTL. */
  invalidate(userId: string) {
    this.cache.delete(userId);
  }
}
