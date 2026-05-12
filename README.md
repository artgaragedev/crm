# Art Garage CRM

Внутренняя CRM для учёта товаров: приходы (IN), списания (OUT), корректировки (ADJUST), текущие остатки и привязка списаний к клиентам / приходов к поставщикам.

## Стек

- **Frontend**: Next.js 15 (app router, TypeScript) → Vercel
- **Backend**: NestJS 10 (TypeScript) → Railway
- **БД**: PostgreSQL → Neon
- **ORM**: Prisma 6
- **UI**: shadcn/ui + Tailwind CSS
- **Auth**: JWT (Passport) + bcrypt, role-based (ADMIN / STAFF)
- **Структура**: pnpm workspaces (monorepo)

## Структура

```
art-garage-crm/
├── apps/
│   ├── web/           # Next.js (Vercel)
│   └── api/           # NestJS + Prisma (Railway)
├── packages/
│   └── shared/        # общие Zod-схемы и DTO-типы
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

Бэкенд владеет Prisma-схемой; в `packages/shared` лежат **DTO**-схемы (Zod), которые валидируют вход/выход HTTP. Никогда не импортируй сырые Prisma-типы во фронт — это утечка модели данных.

---

## Локальный запуск

### 1. Зависимости

Нужны:
- Node.js >= 20.11
- pnpm >= 10
- PostgreSQL (локальный или Neon)

```bash
pnpm install
```

### 2. Настрой переменные окружения

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Заполни `apps/api/.env`:
- `DATABASE_URL` — connection string Postgres (для Neon обязательно `?sslmode=require`)
- `JWT_SECRET` — длинная случайная строка (`openssl rand -hex 32`)
- `WEB_ORIGIN` — `http://localhost:3000` локально, потом Vercel-URL

`apps/web/.env.local`:
- `NEXT_PUBLIC_API_URL` — `http://localhost:4000/api` локально, потом Railway-URL + `/api`

### 3. Миграция БД и сид

```bash
pnpm db:migrate           # создаст миграцию и применит
pnpm --filter @art-garage/api prisma:seed   # создаст админа admin@art-garage.local / admin12345
```

### 4. Dev

```bash
pnpm dev          # запустит web и api параллельно
# либо по отдельности:
pnpm dev:api      # NestJS на :4000
pnpm dev:web      # Next.js на :3000
```

Открой http://localhost:3000 → "Войти" → admin@art-garage.local / admin12345.

---

## Деплой

Поэтапно: **Neon → Railway → Vercel**. Так в каждый следующий шаг попадает уже работающий URL предыдущего.

### ⚠ Перед прод-деплоем — обязательно

CRM хранит финансовые данные клиента. Это **не игрушка**, а внутренний инструмент с риском утечки. Прежде чем открывать наружу:

1. **Сгенерировать новый `JWT_SECRET`**: `openssl rand -hex 32`. Не использовать локальный — он мог попасть в git.
2. **Не выставлять `ENABLE_REGISTRATION=true`** в Railway. По умолчанию `/api/auth/register` возвращает 404 — это правильное поведение для production. Сотрудников добавляй через `prisma:seed` или новый admin-only endpoint.
3. **Сменить пароль `admin@art-garage.local`** с дефолтного `admin12345` на нормальный (UI пока не умеет — делай SQL через Neon: `UPDATE "User" SET "passwordHash"='<bcrypt>' WHERE email='admin@art-garage.local'`).
4. **Health-check `/api/health`** теперь пингует БД и возвращает 503 при недоступности Postgres. Настрой Railway health-check на этот путь — оркестратор сам перезапустит сервис.
5. **Rate-limit**: `@nestjs/throttler` уже подключён. Глобально 60 req/min/IP, на `/auth/login` и `/auth/register` — 5/min/IP. Брутфорс пароля теперь стоит дороже.
6. **CORS**: после первого деплоя Vercel поставь `WEB_ORIGIN=https://<твой-домен>.vercel.app` в Railway. Если будут preview-деплои — через запятую: `WEB_ORIGIN=https://main.example.com,https://staging.example.com`.

### Шаг 1. Neon (БД)

1. Создай проект на https://neon.tech, выбери регион ближе к Railway (eu-central-1 / us-east-1).
2. На странице проекта скопируй "Pooled connection" string. Он выглядит как:
   `postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/dbname?sslmode=require`
3. Сохрани отдельно ещё и **direct** connection (без pooler) — Prisma migrate любит его. Если хочешь делать миграции из CI, прокидывай direct, в рантайм — pooled.

### Шаг 2. Railway (API)

1. Создай новый проект → "Deploy from GitHub repo" → выбери этот репозиторий.
2. В настройках сервиса:
   - **Root Directory**: `apps/api`
   - **Build Command**: автоматически подхватится из `apps/api/railway.json`, либо явно:
     `pnpm install --frozen-lockfile && pnpm --filter @art-garage/api prisma generate && pnpm --filter @art-garage/api build`
   - **Start Command**:
     `pnpm --filter @art-garage/api prisma migrate deploy && pnpm --filter @art-garage/api start:prod`
   - **Watch paths**: `apps/api/**`, `packages/shared/**`, `pnpm-lock.yaml`
3. Variables:
   - `DATABASE_URL` = pooled Neon URL
   - `JWT_SECRET` = `openssl rand -hex 32`
   - `JWT_EXPIRES_IN` = `7d`
   - `WEB_ORIGIN` = пока пусто, заполнишь после Vercel
   - `PORT` Railway проставит сам
4. Деплой. После старта дёрни `https://<твой-домен>.up.railway.app/api/health` — должно вернуть `{ ok: true }`.
5. Создай первого админа:
   - либо через Railway shell: `pnpm --filter @art-garage/api prisma:seed`
   - либо разово через `POST /api/auth/register` и потом руками в Neon SQL Editor поменяй `role = 'ADMIN'`.

### Шаг 3. Vercel (Web)

1. New Project → импортируй тот же GitHub репозиторий.
2. **Root Directory**: `apps/web` (Vercel предложит сам, подтверди).
3. **Framework Preset**: Next.js.
4. **Install Command** и **Build Command** Vercel возьмёт из `apps/web/vercel.json`. Если что — подсунь руками:
   - Install: `cd ../.. && pnpm install --frozen-lockfile`
   - Build: `cd ../.. && pnpm --filter @art-garage/web build`
5. Environment Variables:
   - `NEXT_PUBLIC_API_URL` = `https://<railway-домен>/api`
6. Deploy.

### Шаг 4. CORS

После того как Vercel дал тебе домен (`https://art-garage-crm.vercel.app`), вернись в Railway и поставь:

```
WEB_ORIGIN=https://art-garage-crm.vercel.app
```

Если будут preview-деплои Vercel и нужен доступ — можно перечислить через запятую:
`WEB_ORIGIN=https://art-garage-crm.vercel.app,https://art-garage-crm-git-dev-you.vercel.app`

---

## Доступные API эндпоинты

Все, кроме `auth/login`, `auth/register` и `health`, требуют `Authorization: Bearer <token>`.

| Метод | Путь | Кто | Что |
|---|---|---|---|
| GET  | `/api/health` | public | health-check |
| POST | `/api/auth/login` | public | вход |
| POST | `/api/auth/register` | public | регистрация (отключи в проде если не нужно) |
| GET  | `/api/auth/me` | auth | текущий пользователь |
| GET  | `/api/users` | ADMIN | список пользователей |
| GET/POST/PATCH/DELETE | `/api/products[/:id]` | auth | товары + текущие остатки |
| GET/POST/PATCH/DELETE | `/api/customers[/:id]` | auth | клиенты |
| GET/POST/PATCH/DELETE | `/api/suppliers[/:id]` | auth | поставщики |
| GET/POST | `/api/stock-movements` | auth | приходы/списания/корректировки |
| DELETE | `/api/stock-movements/:id` | ADMIN | удаление движения |

Списочные эндпоинты принимают `?page=1&pageSize=50&search=...`.

## Доменная модель

```
User (ADMIN | STAFF)
Product (sku, name, unit, price?)
Customer / Supplier (name, phone?, email?)
StockMovement {
  type: IN | OUT | ADJUST
  productId
  quantity (Decimal 14,3)
  supplierId? customerId? userId
  note? createdAt
}
```

**Текущий остаток** считается агрегатом по `StockMovement` (`+IN +ADJUST -OUT`). Это нормализованный подход: рассинхрона не бывает, а если будут тормоза на больших объёмах — добавим `Product.currentStock` с обновлением в той же транзакции.

При создании `OUT` сервис проверяет, что остаток не уйдёт в минус, и валидирует ссылочную целостность supplier/customer внутри одной транзакции.

## Скрипты корня

```bash
pnpm dev               # api + web параллельно
pnpm dev:api           # только api
pnpm dev:web           # только web
pnpm build             # билд обоих
pnpm typecheck         # tsc по всем пакетам
pnpm db:migrate        # prisma migrate dev
pnpm db:generate       # prisma generate
pnpm db:studio         # Prisma Studio
```
# crm
