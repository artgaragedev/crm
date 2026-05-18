  306 const qty = Math.abs(args.quantity);
  307 const totalCost = qty * unitCost;
→ 308 const movement = await tx.stockMovement.create(
Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 5008 ms passed since the start of the transaction. Consider increasing the interactive transaction timeout or doing less work in the transaction.
PrismaClientKnownRequestError: 
Invalid `tx.stockMovement.create()` invocation in
/app/apps/api/dist/stock-movements/stock-movements.service.js:308:53
  305 const unitCost = args.unitCost ?? 0;
  306 const qty = Math.abs(args.quantity);
  307 const totalCost = qty * unitCost;
→ 308 const movement = await tx.stockMovement.create(
Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 5008 ms passed since the start of the transaction. Consider increasing the interactive transaction timeout or doing less work in the transaction.
    at ei.handleRequestError (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:7268)
    at ei.handleAndLogRequestError (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:6593)
    at ei.request (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:6300)
    at async a (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:130:9551)
    at async StockMovementsService.applyOne (/app/apps/api/dist/stock-movements/stock-movements.service.js:308:30)
    at async /app/apps/api/dist/stock-movements/stock-movements.service.js:88:27
    at async Proxy._transactionWithCallback (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:130:8120)
    at async /app/node_modules/.pnpm/@nestjs+core@10.4.22_@nestjs+common@10.4.22_class-transformer@0.5.1_class-validator@0.1_558ae3c7cf983d845eb445c3b6d17e96/node_modules/@nestjs/core/router/router-execution-context.js:46:28
    at async /app/node_modules/.pnpm/@nestjs+core@10.4.22_@nestjs+common@10.4.22_class-transformer@0.5.1_class-validator@0.1_558ae3c7cf983d845eb445c3b6d17e96/node_modules/@nestjs/core/router/router-proxy.js:9:17
[Nest] 66  - 05/18/2026, 11:28:52 AM   ERROR [PrismaService] 
Invalid `tx.stockMovement.create()` invocation in
/app/apps/api/dist/stock-movements/stock-movements.service.js:308:53
  305 const unitCost = args.unitCost ?? 0;
  306 const qty = Math.abs(args.quantity);
  307 const totalCost = qty * unitCost;
→ 308 const movement = await tx.stockMovement.create(
Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 5008 ms passed since the start of the transaction. Consider increasing the interactive transaction timeout or doing less work in the transaction.
[Nest] 66  - 05/18/2026, 11:28:52 AM   ERROR [ExceptionsHandler] 
Invalid `tx.stockMovement.create()` invocation in
/app/apps/api/dist/stock-movements/stock-movements.service.js:308:53
  305 const unitCost = args.unitCost ?? 0;
  306 const qty = Math.abs(args.quantity);
  307 const totalCost = qty * unitCost;
→ 308 const movement = await tx.stockMovement.create(
Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 5008 ms passed since the start of the transaction. Consider increasing the interactive transaction timeout or doing less work in the transaction.
PrismaClientKnownRequestError: 
Invalid `tx.stockMovement.create()` invocation in
/app/apps/api/dist/stock-movements/stock-movements.service.js:308:53
  305 const unitCost = args.unitCost ?? 0;
  306 const qty = Math.abs(args.quantity);
  307 const totalCost = qty * unitCost;
→ 308 const movement = await tx.stockMovement.create(
Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 5008 ms passed since the start of the transaction. Consider increasing the interactive transaction timeout or doing less work in the transaction.
    at ei.handleRequestError (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:7268)
    at ei.handleAndLogRequestError (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:6593)
    at ei.request (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:6300)
    at async a (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:130:9551)
    at async StockMovementsService.applyOne (/app/apps/api/dist/stock-movements/stock-movements.service.js:308:30)
    at async /app/apps/api/dist/stock-movements/stock-movements.service.js:88:27
    at async Proxy._transactionWithCallback (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:130:8120)
    at async /app/node_modules/.pnpm/@nestjs+core@10.4.22_@nestjs+common@10.4.22_class-transformer@0.5.1_class-validator@0.1_558ae3c7cf983d845eb445c3b6d17e96/node_modules/@nestjs/core/router/router-execution-context.js:46:28
    at async /app/node_modules/.pnpm/@nestjs+core@10.4.22_@nestjs+common@10.4.22_class-transformer@0.5.1_class-validator@0.1_558ae3c7cf983d845eb445c3b6d17e96/node_modules/@nestjs/core/router/router-proxy.js:9:17
[Nest] 66  - 05/18/2026, 11:33:32 AM   ERROR [PrismaService] 
Invalid `tx.stockMovement.create()` invocation in
/app/apps/api/dist/stock-movements/stock-movements.service.js:308:53
  305 const unitCost = args.unitCost ?? 0;
  306 const qty = Math.abs(args.quantity);
  307 const totalCost = qty * unitCost;
→ 308 const movement = await tx.stockMovement.create(
Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 5009 ms passed since the start of the transaction. Consider increasing the interactive transaction timeout or doing less work in the transaction.
[Nest] 66  - 05/18/2026, 11:33:32 AM   ERROR [ExceptionsHandler] 
Invalid `tx.stockMovement.create()` invocation in
/app/apps/api/dist/stock-movements/stock-movements.service.js:308:53
  305 const unitCost = args.unitCost ?? 0;
  306 const qty = Math.abs(args.quantity);
  307 const totalCost = qty * unitCost;
→ 308 const movement = await tx.stockMovement.create(
Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 5009 ms passed since the start of the transaction. Consider increasing the interactive transaction timeout or doing less work in the transaction.
PrismaClientKnownRequestError: 
Invalid `tx.stockMovement.create()` invocation in
/app/apps/api/dist/stock-movements/stock-movements.service.js:308:53
  305 const unitCost = args.unitCost ?? 0;
  306 const qty = Math.abs(args.quantity);
  307 const totalCost = qty * unitCost;
→ 308 const movement = await tx.stockMovement.create(
Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 5009 ms passed since the start of the transaction. Consider increasing the interactive transaction timeout or doing less work in the transaction.
    at ei.handleRequestError (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:7268)
    at ei.handleAndLogRequestError (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:6593)
    at ei.request (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:6300)
    at async a (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:130:9551)
    at async StockMovementsService.applyOne (/app/apps/api/dist/stock-movements/stock-movements.service.js:308:30)
    at async /app/apps/api/dist/stock-movements/stock-movements.service.js:88:27
    at async Proxy._transactionWithCallback (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:130:8120)
    at async /app/node_modules/.pnpm/@nestjs+core@10.4.22_@nestjs+common@10.4.22_class-transformer@0.5.1_class-validator@0.1_558ae3c7cf983d845eb445c3b6d17e96/node_modules/@nestjs/core/router/router-execution-context.js:46:28
    at async /app/node_modules/.pnpm/@nestjs+core@10.4.22_@nestjs+common@10.4.22_class-transformer@0.5.1_class-validator@0.1_558ae3c7cf983d845eb445c3b6d17e96/node_modules/@nestjs/core/router/router-proxy.js:9:17
/app/apps/api/dist/stock-movements/stock-movements.service.js:308:53
  305 const unitCost = args.unitCost ?? 0;
  306 const qty = Math.abs(args.quantity);
  307 const totalCost = qty * unitCost;
→ 308 const movement = await tx.stockMovement.create(
Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 5008 ms passed since the start of the transaction. Consider increasing the interactive transaction timeout or doing less work in the transaction.
→ 308 const movement = await tx.stockMovement.create(
Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 5008 ms passed since the start of the transaction. Consider increasing the interactive transaction timeout or doing less work in the transaction.
[Nest] 66  - 05/18/2026, 11:57:28 AM   ERROR [ExceptionsHandler] 
Invalid `tx.stockMovement.create()` invocation in
[Nest] 66  - 05/18/2026, 11:57:28 AM   ERROR [PrismaService] 
Invalid `tx.stockMovement.create()` invocation in
/app/apps/api/dist/stock-movements/stock-movements.service.js:308:53
  305 const unitCost = args.unitCost ?? 0;
  306 const qty = Math.abs(args.quantity);
  307 const totalCost = qty * unitCost;
PrismaClientKnownRequestError: 
Invalid `tx.stockMovement.create()` invocation in
/app/apps/api/dist/stock-movements/stock-movements.service.js:308:53
  305 const unitCost = args.unitCost ?? 0;
  306 const qty = Math.abs(args.quantity);
  307 const totalCost = qty * unitCost;
→ 308 const movement = await tx.stockMovement.create(
Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 5008 ms passed since the start of the transaction. Consider increasing the interactive transaction timeout or doing less work in the transaction.
    at ei.handleRequestError (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:7268)
    at ei.handleAndLogRequestError (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:6593)
    at ei.request (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:6300)
    at async a (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:130:9551)
    at async StockMovementsService.applyOne (/app/apps/api/dist/stock-movements/stock-movements.service.js:308:30)
    at async /app/apps/api/dist/stock-movements/stock-movements.service.js:88:27
    at async Proxy._transactionWithCallback (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:130:8120)
    at async /app/node_modules/.pnpm/@nestjs+core@10.4.22_@nestjs+common@10.4.22_class-transformer@0.5.1_class-validator@0.1_558ae3c7cf983d845eb445c3b6d17e96/node_modules/@nestjs/core/router/router-execution-context.js:46:28
    at async /app/node_modules/.pnpm/@nestjs+core@10.4.22_@nestjs+common@10.4.22_class-transformer@0.5.1_class-validator@0.1_558ae3c7cf983d845eb445c3b6d17e96/node_modules/@nestjs/core/router/router-proxy.js:9:17