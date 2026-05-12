import { Body, Controller, Get, NotFoundException, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  loginInputSchema,
  registerInputSchema,
  type LoginInput,
  type RegisterInput,
  type AuthUser,
} from '@art-garage/shared';
import { ZodValidationPipe } from '../common/zod.dto';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { CurrentUser } from './current-user.decorator';

/** Жёсткий лимит на анонимные эндпоинты: 5 попыток/мин/IP — защита от брутфорса. */
const AUTH_RATE_LIMIT = { default: { limit: 5, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(AUTH_RATE_LIMIT)
  @Post('login')
  login(@Body(new ZodValidationPipe(loginInputSchema)) input: LoginInput) {
    return this.auth.login(input);
  }

  /**
   * Публичная регистрация. По умолчанию выключена — в проде это путь к захвату системы:
   * любой создал бы себе аккаунт STAFF и читал бы клиентов/выручку.
   * Для bootstrap первого админа — используй prisma:seed или прямой SQL.
   * Для добавления сотрудников — отдельный admin-only endpoint (TODO).
   */
  @Public()
  @Throttle(AUTH_RATE_LIMIT)
  @Post('register')
  register(@Body(new ZodValidationPipe(registerInputSchema)) input: RegisterInput) {
    if (process.env.ENABLE_REGISTRATION !== 'true') {
      throw new NotFoundException('Not Found');
    }
    return this.auth.register(input);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
