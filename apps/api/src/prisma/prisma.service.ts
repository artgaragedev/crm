import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/** Запрос дольше этого порога — кандидат на оптимизацию. Логируем чтобы видеть в Railway. */
const SLOW_QUERY_MS = 1000;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit() {
    // Когда query идёт > SLOW_QUERY_MS — пишем warn с длительностью и сокращённым SQL.
    // Чтобы быстро находить запросы которые держат коннект в pool'е.
    (this.$on as unknown as (e: 'query', cb: (event: Prisma.QueryEvent) => void) => void)(
      'query',
      (event) => {
        if (event.duration >= SLOW_QUERY_MS) {
          const sql = event.query.length > 300 ? event.query.slice(0, 300) + '…' : event.query;
          this.log.warn(`slow query ${event.duration}ms: ${sql}`);
        }
      },
    );
    (this.$on as unknown as (e: 'warn', cb: (event: Prisma.LogEvent) => void) => void)(
      'warn',
      (event) => this.log.warn(event.message),
    );
    (this.$on as unknown as (e: 'error', cb: (event: Prisma.LogEvent) => void) => void)(
      'error',
      (event) => this.log.error(event.message),
    );

    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
