[Nest] 66  - 05/14/2026, 9:24:37 AM   ERROR [ExceptionsHandler] 
Invalid `tx.productVariant.create()` invocation in
/app/apps/api/dist/variants/variants.service.js:262:61
  259 const orderedSnapshot = {};
  260 for (const r of orderedRefs)
  261     orderedSnapshot[r.attributeCode] = r.valueCode;
→ 262 const created = await tx.productVariant.create(
Transaction API error: Transaction not found. Transaction ID is invalid, refers to an old closed transaction Prisma doesn't have information about anymore, or was obtained before disconnecting.
PrismaClientKnownRequestError: 
Invalid `tx.productVariant.create()` invocation in
/app/apps/api/dist/variants/variants.service.js:262:61
  259 const orderedSnapshot = {};
  260 for (const r of orderedRefs)
  261     orderedSnapshot[r.attributeCode] = r.valueCode;
→ 262 const created = await tx.productVariant.create(
Transaction API error: Transaction not found. Transaction ID is invalid, refers to an old closed transaction Prisma doesn't have information about anymore, or was obtained before disconnecting.
    at ei.handleRequestError (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:7268)
    at ei.request (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:6300)
    at async a (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:130:9551)
    at async /app/apps/api/dist/variants/variants.service.js:262:37
    at async Proxy._transactionWithCallback (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:130:8120)
    at async VariantsService.createProductWithMatrix (/app/apps/api/dist/variants/variants.service.js:228:28)
    at async /app/node_modules/.pnpm/@nestjs+core@10.4.22_@nestjs+common@10.4.22_class-transformer@0.5.1_class-validator@0.1_558ae3c7cf983d845eb445c3b6d17e96/node_modules/@nestjs/core/router/router-execution-context.js:46:28
    at async /app/node_modules/.pnpm/@nestjs+core@10.4.22_@nestjs+common@10.4.22_class-transformer@0.5.1_class-validator@0.1_558ae3c7cf983d845eb445c3b6d17e96/node_modules/@nestjs/core/router/router-proxy.js:9:17
    at ei.handleAndLogRequestError (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:6593)
[Nest] 66  - 05/14/2026, 9:25:09 AM   ERROR [ExceptionsHandler] 
Invalid `tx.productVariant.create()` invocation in
/app/apps/api/dist/variants/variants.service.js:262:61
  259 const orderedSnapshot = {};
  260 for (const r of orderedRefs)
  261     orderedSnapshot[r.attributeCode] = r.valueCode;
→ 262 const created = await tx.productVariant.create(
Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 5015 ms passed since the start of the transaction. Consider increasing the interactive transaction timeout or doing less work in the transaction.
PrismaClientKnownRequestError: 
Invalid `tx.productVariant.create()` invocation in
/app/apps/api/dist/variants/variants.service.js:262:61
  259 const orderedSnapshot = {};
  260 for (const r of orderedRefs)
  261     orderedSnapshot[r.attributeCode] = r.valueCode;
→ 262 const created = await tx.productVariant.create(
Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 5015 ms passed since the start of the transaction. Consider increasing the interactive transaction timeout or doing less work in the transaction.
    at ei.handleRequestError (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:7268)
    at ei.handleAndLogRequestError (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:6593)
    at ei.request (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:6300)
    at async a (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:130:9551)
    at async /app/apps/api/dist/variants/variants.service.js:262:37
    at async Proxy._transactionWithCallback (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:130:8120)
    at async VariantsService.createProductWithMatrix (/app/apps/api/dist/variants/variants.service.js:228:28)
    at async /app/node_modules/.pnpm/@nestjs+core@10.4.22_@nestjs+common@10.4.22_class-transformer@0.5.1_class-validator@0.1_558ae3c7cf983d845eb445c3b6d17e96/node_modules/@nestjs/core/router/router-execution-context.js:46:28
    at async /app/node_modules/.pnpm/@nestjs+core@10.4.22_@nestjs+common@10.4.22_class-transformer@0.5.1_class-validator@0.1_558ae3c7cf983d845eb445c3b6d17e96/node_modules/@nestjs/core/router/router-proxy.js:9:17
  259 const orderedSnapshot = {};
  260 for (const r of orderedRefs)
  261     orderedSnapshot[r.attributeCode] = r.valueCode;
→ 262 const created = await tx.productVariant.create(
Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 5009 ms passed since the start of the transaction. Consider increasing the interactive transaction timeout or doing less work in the transaction.
/app/apps/api/dist/variants/variants.service.js:262:61
  259 const orderedSnapshot = {};
  260 for (const r of orderedRefs)
→ 262 const created = await tx.productVariant.create(
Transaction API error: Transaction already closed: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 5009 ms passed since the start of the transaction. Consider increasing the interactive transaction timeout or doing less work in the transaction.
PrismaClientKnownRequestError: 
Invalid `tx.productVariant.create()` invocation in
/app/apps/api/dist/variants/variants.service.js:262:61
  261     orderedSnapshot[r.attributeCode] = r.valueCode;
[Nest] 66  - 05/14/2026, 9:25:23 AM   ERROR [ExceptionsHandler] 
Invalid `tx.productVariant.create()` invocation in
    at ei.request (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:6300)
    at async a (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:130:9551)
    at async /app/apps/api/dist/variants/variants.service.js:262:37
    at async Proxy._transactionWithCallback (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:130:8120)
    at async VariantsService.createProductWithMatrix (/app/apps/api/dist/variants/variants.service.js:228:28)
    at async /app/node_modules/.pnpm/@nestjs+core@10.4.22_@nestjs+common@10.4.22_class-transformer@0.5.1_class-validator@0.1_558ae3c7cf983d845eb445c3b6d17e96/node_modules/@nestjs/core/router/router-execution-context.js:46:28
    at async /app/node_modules/.pnpm/@nestjs+core@10.4.22_@nestjs+common@10.4.22_class-transformer@0.5.1_class-validator@0.1_558ae3c7cf983d845eb445c3b6d17e96/node_modules/@nestjs/core/router/router-proxy.js:9:17
    at ei.handleRequestError (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:7268)
    at ei.handleAndLogRequestError (/app/node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client/runtime/library.js:121:6593)