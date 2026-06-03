// Конфигурация Prisma CLI (миграции/сид/генерация).
// Заменяет устаревший блок "prisma" в package.json (удалён в Prisma 7).
//
// ВАЖНО: при наличии prisma.config.ts Prisma больше НЕ загружает .env автоматически —
// поэтому подключаем dotenv вручную. На Railway DATABASE_URL приходит как реальная env-переменная,
// dotenv там просто ничего не находит и не мешает.
//
// datasource намеренно не дублируем: url и directUrl уже заданы в schema.prisma через env().
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node --transpile-only prisma/seed.ts',
  },
});
