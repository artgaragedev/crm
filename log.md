Starting Container
warn The configuration property `package.json#prisma` is deprecated and will be removed in Prisma 7. Please migrate to a Prisma config file (e.g., `prisma.config.ts`).
For more information, see: https://pris.ly/prisma-config
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "neondb", schema "public" at "ep-cold-smoke-al73qc0a.c-3.eu-central-1.aws.neon.tech"
8 migrations found in prisma/migrations
No pending migrations to apply.
 33 if (!payload?.sub) {
  34     throw new common_1.UnauthorizedException();
  35 }
→ 36 const user = await this.prisma.user.findUnique(
Timed out fetching a new connection from the connection pool. More info: http://pris.ly/d/connection-pool (Current connection pool timeout: 10, connection limit: 33)
    at ei.handleRequestError (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:7268)
    at ei.handleAndLogRequestError (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:6593)
[Nest] 66  - 05/15/2026, 3:31:07 PM   ERROR [ExceptionsHandler] 
Invalid `this.prisma.user.findUnique()` invocation in
/app/apps/api/dist/auth/jwt.strategy.js:36:45
  33 if (!payload?.sub) {
  34     throw new common_1.UnauthorizedException();
  35 }
→ 36 const user = await this.prisma.user.findUnique(
Timed out fetching a new connection from the connection pool. More info: http://pris.ly/d/connection-pool (Current connection pool timeout: 10, connection limit: 33)
PrismaClientKnownRequestError: 
Invalid `this.prisma.user.findUnique()` invocation in
/app/apps/api/dist/auth/jwt.strategy.js:36:45
/app/apps/api/dist/auth/jwt.strategy.js:36:45
  33 if (!payload?.sub) {
  34     throw new common_1.UnauthorizedException();
    at ei.request (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:6300)
  35 }
    at async a (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:130:9551)
→ 36 const user = await this.prisma.user.findUnique(
    at async JwtStrategy.validate (/app/apps/api/dist/auth/jwt.strategy.js:36:22)
    at async JwtStrategy.callback [as _verify] (/app/node_modules/.pnpm/@nestjs+passport@10.0.3_@nestjs+common@10.4.22_class-transformer@0.5.1_class-validator@_065c9ed2201c8c1f9dc8ddcfbf04f6d1/node_modules/@nestjs/passport/dist/passport/passport.strategy.js:11:44)
Timed out fetching a new connection from the connection pool. More info: http://pris.ly/d/connection-pool (Current connection pool timeout: 10, connection limit: 33)
[Nest] 66  - 05/15/2026, 3:31:07 PM   ERROR [ExceptionsHandler] 
PrismaClientKnownRequestError: 
Invalid `this.prisma.user.findUnique()` invocation in
Invalid `this.prisma.user.findUnique()` invocation in
/app/apps/api/dist/auth/jwt.strategy.js:36:45
  33 if (!payload?.sub) {
  34     throw new common_1.UnauthorizedException();
  35 }
→ 36 const user = await this.prisma.user.findUnique(
Timed out fetching a new connection from the connection pool. More info: http://pris.ly/d/connection-pool (Current connection pool timeout: 10, connection limit: 33)
    at ei.handleRequestError (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:7268)
    at ei.handleAndLogRequestError (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:6593)
    at ei.request (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:6300)
    at async a (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:130:9551)
    at async JwtStrategy.validate (/app/apps/api/dist/auth/jwt.strategy.js:36:22)
    at async JwtStrategy.callback [as _verify] (/app/node_modules/.pnpm/@nestjs+passport@10.0.3_@nestjs+common@10.4.22_class-transformer@0.5.1_class-validator@_065c9ed2201c8c1f9dc8ddcfbf04f6d1/node_modules/@nestjs/passport/dist/passport/passport.strategy.js:11:44)
