import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/** Запрос дольше этого порога — кандидат на оптимизацию. Логируем чтобы видеть в Railway. */
const SLOW_QUERY_MS = 1000;

/**
 * Нормализуем connection string для Neon serverless.
 *
 * Зачем в коде, а не только в env: на проде (Railway) DATABASE_URL задаётся через дашборд,
 * и если там забыли connection_limit/connect_timeout — Prisma берёт дефолты, которые ломают
 * нас на холодном старте Neon:
 *  - connection_limit по умолчанию = CPU×2+1. Контейнер видит CPU хост-машины (→ 33),
 *    и при scale-to-zero Neon получает «шторм» из 33 одновременных connect к спящему compute.
 *  - connect_timeout=10 не всегда хватает на cold start под нагрузкой → P1001.
 *  - pool_timeout=10 → пока БД просыпается, очередь за коннектами отваливается по P2024.
 *
 * Мы НЕ перетираем значения, заданные явно в URL — только дозаполняем отсутствующие.
 */
function buildDatasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Невалидный URL — отдаём как есть, пусть Prisma ругнётся понятной ошибкой.
    return raw;
  }

  // Хост с "-pooler" => идём через PgBouncer-пулер Neon (до 10k коннектов).
  if (url.hostname.includes('-pooler') && !url.searchParams.has('pgbouncer')) {
    url.searchParams.set('pgbouncer', 'true');
  }

  const defaults: Record<string, string> = {
    connection_limit: '10', // предсказуемый пул на инстанс вместо CPU×2+1=33
    pool_timeout: '20', // дать очереди пережить cold start, а не падать на 10с
    connect_timeout: '15', // запас на пробуждение Neon compute
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  }

  return url.toString();
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PrismaService.name);

  constructor() {
    const url = buildDatasourceUrl();
    super({
      ...(url ? { datasources: { db: { url } } } : {}),
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
      (event) => {
        // Шум от Neon: serverless Postgres закрывает idle-соединения каждые ~5 мин.
        // Prisma логирует каждое закрытие, но автоматически реконнектится — это не сбой запроса.
        // Если будут реальные ошибки запросов — они придут с другим сообщением (Timeout, syntax, etc.).
        if (event.message.includes('kind: Closed')) return;
        this.log.error(event.message);
      },
    );

    await this.connectWithRetry();
  }

  /**
   * Neon compute может быть в suspend (scale-to-zero) в момент старта/деплоя — первый connect
   * упирается в спящий endpoint и кидает P1001. Это не фатально: пара ретраев с backoff
   * переживают cold start, вместо того чтобы ронять весь процесс на старте.
   */
  private async connectWithRetry(attempts = 5, delayMs = 1000): Promise<void> {
    for (let i = 1; i <= attempts; i++) {
      try {
        await this.$connect();
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
        if (i === attempts) {
          this.log.error(`DB connect failed after ${attempts} attempts: ${msg}`);
          throw err;
        }
        this.log.warn(`DB connect attempt ${i}/${attempts} failed (${msg}), retry in ${delayMs}ms`);
        await new Promise((r) => setTimeout(r, delayMs));
        delayMs = Math.min(delayMs * 2, 8000); // экспоненциальный backoff, потолок 8с
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
