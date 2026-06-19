/**
 * Healing уже отменённых списаний под новую модель reverse().
 *
 * Старый reverse() при отмене списания НЕ возвращал товар в исходные партии, а создавал
 * новую партию (датой отмены/оригинала). Из-за этого исходные партии оставались с remaining=0,
 * а возврат «переезжал» в другую партию → списание задним числом не видело товар, который
 * исторически был (симптом «нет в наличии при наличии остатка»).
 *
 * Этот скрипт приводит старые данные к новой модели:
 *   1. инкрементит remainingQuantity исходных партий на потреблённое оригиналом количество;
 *   2. удаляет LotConsumption оригинала;
 *   3. удаляет сторно-партию.
 * Сумма остатка по вариации НЕ меняется (сторно-партия −Q, исходные партии +Q).
 *
 * КОНСЕРВАТИВНО: трогает только те сторно, чья сторно-партия НЕТРОНУТА (remaining==initial,
 * нет consumptions). Если возврат уже был частично пере-списан — пропускаем и сообщаем (ручной разбор).
 *
 * Запуск:
 *   DRY-RUN: pnpm tsx apps/api/scripts/heal-reversed-lots.ts
 *   APPLY:   APPLY=yes pnpm tsx apps/api/scripts/heal-reversed-lots.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.env.APPLY === 'yes';
const EPS = 0.0001;

async function main() {
  // Сторно-движения, создавшие партию (т.е. реверс СПИСАНИЯ по старой модели).
  // Реверс прихода создаёт OUT без createdLot — он отфильтрован условием createdLot.isNot=null.
  const stornos = await prisma.stockMovement.findMany({
    where: { reversesId: { not: null }, createdLot: { isNot: null } },
    select: {
      id: true,
      createdLot: {
        select: {
          id: true,
          initialQuantity: true,
          remainingQuantity: true,
          variantId: true,
          _count: { select: { consumptions: true } },
        },
      },
      reverses: {
        select: {
          id: true,
          type: true,
          variant: { select: { sku: true } },
          consumptions: { select: { id: true, lotId: true, quantity: true } },
        },
      },
    },
  });

  let healed = 0;
  let skipped = 0;
  const skips: string[] = [];

  for (const s of stornos) {
    const lot = s.createdLot!;
    const original = s.reverses!;
    const sku = original.variant.sku;

    // Партия из сторно должна быть нетронута.
    const lotUntouched =
      lot._count.consumptions === 0 &&
      Math.abs(Number(lot.initialQuantity) - Number(lot.remainingQuantity)) < EPS;
    if (!lotUntouched) {
      skipped++;
      skips.push(`${sku}: сторно-партия уже пере-списана (remaining ${Number(lot.remainingQuantity)}/${Number(lot.initialQuantity)}, cons=${lot._count.consumptions}) — пропуск`);
      continue;
    }
    // Должно быть что восстанавливать (legacy без consumptions восстановить нечем).
    if (original.consumptions.length === 0) {
      skipped++;
      skips.push(`${sku}: оригинал без consumptions (legacy) — пропуск`);
      continue;
    }

    const restoreQty = original.consumptions.reduce((acc, c) => acc + Number(c.quantity), 0);
    console.log(
      ` ${sku.padEnd(28)} вернуть ${String(restoreQty).padStart(4)} шт в ${original.consumptions.length} партий, удалить сторно-партию ${Number(lot.initialQuantity)} шт`,
    );

    if (APPLY) {
      await prisma.$transaction(async (tx) => {
        for (const c of original.consumptions) {
          await tx.stockLot.update({
            where: { id: c.lotId },
            data: { remainingQuantity: { increment: c.quantity } },
          });
        }
        await tx.lotConsumption.deleteMany({ where: { movementId: original.id } });
        await tx.stockLot.delete({ where: { id: lot.id } });
      });
    }
    healed++;
  }

  console.log(`\nВсего сторно-партий списаний: ${stornos.length}`);
  console.log(`Вылечено:                    ${healed}`);
  console.log(`Пропущено:                   ${skipped}`);
  if (skips.length) {
    console.log('\n-- Пропуски (ручной разбор) --');
    for (const m of skips) console.log('  ' + m);
  }
  console.log(APPLY ? '\nПРИМЕНЕНО.' : '\nDRY-RUN. Для применения: APPLY=yes pnpm tsx apps/api/scripts/heal-reversed-lots.ts');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
