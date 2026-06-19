/**
 * Одноразовый фикс даты партий, созданных сторно списания.
 *
 * Баг: reverse() раньше ставил возвращённой партии receivedAt = "сегодня" (момент отмены),
 * из-за чего товар вставал в конец FIFO и был невидим для списаний задним числом
 * (computeFifoAllocations отсекает receivedAt > movementDate) — симптом «остаток есть,
 * списать нельзя». Сам reverse() уже исправлен (receivedAt = дата оригинала); этот скрипт
 * чинит партии, созданные до фикса.
 *
 * Правит ТОЛЬКО партии, созданные сторно-движением (createdByMovement.reversesId != null).
 * Остатки/инвариант партий не трогаются — меняется лишь дата.
 *
 * Запуск:
 *   DRY-RUN (по умолчанию): pnpm tsx apps/api/scripts/fix-storno-lot-dates.ts
 *   ПРИМЕНИТЬ:              APPLY=yes pnpm tsx apps/api/scripts/fix-storno-lot-dates.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.env.APPLY === 'yes';

async function main() {
  // Партии, созданные сторно-движением, у которого есть ссылка на оригинал.
  const lots = await prisma.stockLot.findMany({
    where: { createdByMovement: { reversesId: { not: null } } },
    select: {
      id: true,
      receivedAt: true,
      variant: { select: { sku: true } },
      createdByMovement: {
        select: { reverses: { select: { createdAt: true } } },
      },
    },
  });

  let toFix = 0;
  for (const lot of lots) {
    const originalDate = lot.createdByMovement?.reverses?.createdAt;
    if (!originalDate) continue;
    // Уже совпадает (с точностью до секунды) — пропускаем.
    if (Math.abs(lot.receivedAt.getTime() - originalDate.getTime()) < 1000) continue;

    toFix++;
    console.log(
      ` ${lot.variant.sku.padEnd(28)} ${lot.receivedAt.toISOString().slice(0, 10)} -> ${originalDate
        .toISOString()
        .slice(0, 10)}`,
    );
    if (APPLY) {
      await prisma.stockLot.update({
        where: { id: lot.id },
        data: { receivedAt: originalDate },
      });
    }
  }

  console.log(`\nВсего сторно-партий:   ${lots.length}`);
  console.log(`К исправлению (дата):  ${toFix}`);
  console.log(APPLY ? '\nПРИМЕНЕНО.' : '\nDRY-RUN. Для применения: APPLY=yes pnpm tsx apps/api/scripts/fix-storno-lot-dates.ts');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
