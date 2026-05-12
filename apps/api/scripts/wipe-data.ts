/* eslint-disable no-console */
/**
 * Полная очистка склада. Удаляет ВСЁ кроме пользователей (User остаётся —
 * иначе админ потеряет логин).
 *
 * Удаляет:
 *   AuditLog → LotConsumption → StockLot → StockMovement →
 *   ProductVariant → Product → Customer → Supplier → Category
 *
 * НЕ удаляет: User (админ продолжит логиниться).
 *
 * Запуск:
 *   Dry-run (только показать что есть в БД):
 *     pnpm --filter @art-garage/api exec ts-node --transpile-only scripts/wipe-data.ts
 *
 *   Реальная очистка (нужно явное подтверждение):
 *     CONFIRM_WIPE=yes pnpm --filter @art-garage/api exec ts-node --transpile-only scripts/wipe-data.ts
 */

import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();

  // 1. Снимаем счётчики до удаления — это и есть dry-run отчёт.
  const [
    auditLogs,
    lotConsumptions,
    stockLots,
    stockMovements,
    productVariants,
    products,
    customers,
    suppliers,
    categories,
    users,
  ] = await Promise.all([
    prisma.auditLog.count(),
    prisma.lotConsumption.count(),
    prisma.stockLot.count(),
    prisma.stockMovement.count(),
    prisma.productVariant.count(),
    prisma.product.count(),
    prisma.customer.count(),
    prisma.supplier.count(),
    prisma.category.count(),
    prisma.user.count(),
  ]);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ПОЛНАЯ ОЧИСТКА БД');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Сейчас в БД:');
  console.log(`  AuditLog:        ${auditLogs.toLocaleString('ru-RU')}`);
  console.log(`  LotConsumption:  ${lotConsumptions.toLocaleString('ru-RU')}`);
  console.log(`  StockLot:        ${stockLots.toLocaleString('ru-RU')}`);
  console.log(`  StockMovement:   ${stockMovements.toLocaleString('ru-RU')}`);
  console.log(`  ProductVariant:  ${productVariants.toLocaleString('ru-RU')}`);
  console.log(`  Product:         ${products.toLocaleString('ru-RU')}`);
  console.log(`  Customer:        ${customers.toLocaleString('ru-RU')}`);
  console.log(`  Supplier:        ${suppliers.toLocaleString('ru-RU')}`);
  console.log(`  Category:        ${categories.toLocaleString('ru-RU')}`);
  console.log(`  User (НЕ трогаем): ${users.toLocaleString('ru-RU')}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (process.env.CONFIRM_WIPE !== 'yes') {
    console.log('');
    console.log('Это был DRY-RUN. Ничего не удалено.');
    console.log('Для реальной очистки запусти с CONFIRM_WIPE=yes');
    await prisma.$disconnect();
    return;
  }

  console.log('');
  console.log('CONFIRM_WIPE=yes — удаляю...');

  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.lotConsumption.deleteMany(),
    prisma.stockLot.deleteMany(),
    prisma.stockMovement.deleteMany(),
    prisma.productVariant.deleteMany(),
    prisma.product.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.supplier.deleteMany(),
    prisma.category.deleteMany(),
  ]);

  // Проверка после удаления.
  const after = await Promise.all([
    prisma.auditLog.count(),
    prisma.lotConsumption.count(),
    prisma.stockLot.count(),
    prisma.stockMovement.count(),
    prisma.productVariant.count(),
    prisma.product.count(),
    prisma.customer.count(),
    prisma.supplier.count(),
    prisma.category.count(),
    prisma.user.count(),
  ]);
  const allZero =
    after[0] === 0 &&
    after[1] === 0 &&
    after[2] === 0 &&
    after[3] === 0 &&
    after[4] === 0 &&
    after[5] === 0 &&
    after[6] === 0 &&
    after[7] === 0 &&
    after[8] === 0;

  if (allZero) {
    console.log('  ✓ всё удалено');
    console.log(`  ✓ User остался: ${after[9]} (админ может логиниться)`);
  } else {
    console.log('  ✗ что-то не удалилось:');
    console.log(`    AuditLog: ${after[0]}, LotConsumption: ${after[1]}, StockLot: ${after[2]}`);
    console.log(`    StockMovement: ${after[3]}, ProductVariant: ${after[4]}, Product: ${after[5]}`);
    console.log(`    Customer: ${after[6]}, Supplier: ${after[7]}, Category: ${after[8]}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
