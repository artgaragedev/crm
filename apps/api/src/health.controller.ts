import { Controller, Get, HttpCode, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from './prisma/prisma.service';
import { Public } from './auth/public.decorator';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness + readiness в одном эндпоинте.
   * Без пинга БД хостинг (Railway/Vercel) считал бы сервис здоровым даже при упавшем Neon —
   * наш health-check падает 503, чтобы оркестратор поднял тревогу.
   */
  @Public()
  @Get('health')
  @HttpCode(200)
  async health(@Res({ passthrough: true }) res: Response) {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, db: 'ok', ts: new Date().toISOString() };
    } catch (e) {
      res.status(503);
      return {
        ok: false,
        db: 'down',
        error: e instanceof Error ? e.message : 'unknown',
        ts: new Date().toISOString(),
      };
    }
  }
}
