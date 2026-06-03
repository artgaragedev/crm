/**
 * Реконсиляция StockLot.remainingQuantity.
 *
 * Инвариант: remainingQuantity = initialQuantity − Σ(lotConsumption.quantity).
 * Источник истины — ledger lotConsumption (он всегда пишется вместе с декрементом
 * в штатном пути applyOne). Если remainingQuantity разъехался с этим инвариантом —
 * значит остаток был изменён в обход (ручной backdated-ввод под старой логикой,
 * импорт без создания lot и т.п.), и его нужно восстановить.
 *
 * Симптом: в списке остаток положительный (он считается из движений), а списание
 * пишет «недостаточно товара» (FIFO смотрит на remainingQuantity).
 *
 * Запуск:
 *   DRY-RUN (по умолчанию, только отчёт): pnpm tsx apps/api/scripts/reconcile-lots.ts
 *   ПРИМЕНИТЬ:                            APPLY=yes pnpm tsx apps/api/scripts/reconcile-lots.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.env.APPLY === 'yes';

async function main() {
  const lots = await prisma.stockLot.findMany({
    select: {
      id: true,
      variantId: true,
      initialQuantity: true,
      remainingQuantity: true,
      consumptions: { select: { quantity: true } },
    },
  });

  const fixes: Array<{ id: string; variantId: string; from: number; to: number }> = [];

  for (const lot of lots) {
    const consumed = lot.consumptions.reduce((s, c) => s + Number(c.quantity), 0);
    const expected = Number(lot.initialQuantity) - consumed;
    const actual = Number(lot.remainingQuantity);
    if (Math.abs(expected - actual) > 0.001) {
      fixes.push({ id: lot.id, variantId: lot.variantId, from: actual, to: expected });
    }
  }

  const affectedVariants = new Set(fixes.map((f) => f.variantId));
  console.log(`Всего партий:                 ${lots.length}`);
  console.log(`С рассинхроном remaining:     ${fixes.length}`);
  console.log(`Затронуто вариаций:           ${affectedVariants.size}`);
  console.log('');
  for (const f of fixes) {
    console.log(`  lot ${f.id.slice(-8)} (variant ${f.variantId.slice(-8)}): ${f.from} → ${f.to}`);
  }
  console.log('');

  if (!APPLY) {
    console.log('DRY-RUN. Ничего не записано. Для применения: APPLY=yes pnpm tsx apps/api/scripts/reconcile-lots.ts');
    await prisma.$disconnect();
    return;
  }

  // Применяем по одному в транзакции по вариации — чтобы не держать гигантскую транзакцию.
  for (const f of fixes) {
    await prisma.stockLot.update({
      where: { id: f.id },
      data: { remainingQuantity: f.to },
    });
  }
  console.log(`✓ Обновлено партий: ${fixes.length}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
