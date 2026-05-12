import { z } from 'zod';

export const movementTypeSchema = z.enum(['IN', 'OUT', 'ADJUST']);
export type MovementType = z.infer<typeof movementTypeSchema>;

export const stockMovementSchema = z.object({
  id: z.string(),
  type: movementTypeSchema,
  variantId: z.string(),
  /** ADJUST может быть отрицательным (списание без клиента — брак/потеря). IN/OUT всегда положительные. */
  quantity: z.number(),
  supplierId: z.string().nullable(),
  customerId: z.string().nullable(),
  userId: z.string(),
  note: z.string().nullable(),
  totalCost: z.number().nullable().optional(),
  /** Фактическая цена за единицу в момент сделки (OUT/ADJUST-). Null для IN/ADJUST+ и legacy. */
  unitPrice: z.number().nullable().optional(),
  /** Скидка клиента, замороженная в момент сделки. */
  discountPercent: z.number().nullable().optional(),
  reversesId: z.string().nullable().optional(),
  createdAt: z.string(),
});

/** Партия (lot). */
export const stockLotSchema = z.object({
  id: z.string(),
  variantId: z.string(),
  unitCost: z.number(),
  initialQuantity: z.number(),
  remainingQuantity: z.number(),
  receivedAt: z.string(),
  supplierId: z.string().nullable(),
  note: z.string().nullable(),
  userId: z.string(),
  createdByMovementId: z.string(),
  createdAt: z.string(),
});
export type StockLot = z.infer<typeof stockLotSchema>;

/** Ручное распределение списания по партиям. Сумма qty должна равняться кол-ву движения. */
export const lotAllocationSchema = z.object({
  lotId: z.string().min(1),
  quantity: z.number().positive(),
});
export type LotAllocation = z.infer<typeof lotAllocationSchema>;
export type StockMovement = z.infer<typeof stockMovementSchema>;

export const createStockMovementInputSchema = z
  .object({
    type: movementTypeSchema,
    variantId: z.string().min(1),
    quantity: z.number().refine((v) => v !== 0, 'Количество не может быть нулевым'),
    supplierId: z.string().min(1).optional(),
    customerId: z.string().min(1).optional(),
    note: z.string().max(1000).optional(),
    /** Закупочная цена (для IN/ADJUST+). Если не задана — берём 0. */
    unitCost: z.number().nonnegative().optional(),
    /** Фактическая цена продажи за единицу (для OUT/ADJUST-). Если не задана — выводится из Variant.price и скидки клиента. */
    unitPrice: z.number().nonnegative().optional(),
    /** Ручное распределение списания (для OUT/ADJUST-). Если не задано — FIFO. */
    lotAllocations: z.array(lotAllocationSchema).optional(),
  })
  .refine((v) => v.type === 'ADJUST' || v.quantity > 0, {
    message: 'Для прихода и списания количество должно быть положительным',
    path: ['quantity'],
  })
  .refine((v) => (v.type === 'IN' ? !v.customerId : true), {
    message: 'У прихода не должно быть клиента',
    path: ['customerId'],
  })
  .refine((v) => (v.type === 'OUT' ? !v.supplierId : true), {
    message: 'У списания не должно быть поставщика',
    path: ['supplierId'],
  });
export type CreateStockMovementInput = z.infer<typeof createStockMovementInputSchema>;

/**
 * Батчевое создание движений: один документ (header + N строк).
 * Используется для приходных накладных, отгрузок клиенту с несколькими товарами,
 * массовой инвентаризации.
 */
export const createMovementBatchInputSchema = z
  .object({
    type: movementTypeSchema,
    supplierId: z.string().min(1).optional(),
    customerId: z.string().min(1).optional(),
    note: z.string().max(1000).optional(),
    /** ISO date string. Если не задано — текущая дата на сервере. */
    date: z.string().datetime().optional(),
    lines: z
      .array(
        z.object({
          variantId: z.string().min(1),
          quantity: z.number().refine((v) => v !== 0, 'Количество не может быть нулевым'),
          /** Закупочная цена для IN/ADJUST+ (по умолчанию 0). */
          unitCost: z.number().nonnegative().optional(),
          /** Фактическая цена продажи (для OUT/ADJUST-). Если не задана — выводится из Variant.price и скидки клиента. */
          unitPrice: z.number().nonnegative().optional(),
          /** Ручное распределение по партиям для OUT/ADJUST-. */
          lotAllocations: z.array(lotAllocationSchema).optional(),
        }),
      )
      .min(1, 'Минимум одна строка')
      .max(500),
  })
  .refine(
    (v) => v.lines.every((l) => v.type === 'ADJUST' || l.quantity > 0),
    {
      message: 'Для прихода и списания количество должно быть положительным',
      path: ['lines'],
    },
  )
  .refine((v) => (v.type === 'IN' ? !v.customerId : true), {
    message: 'У прихода не должно быть клиента',
    path: ['customerId'],
  })
  .refine((v) => (v.type === 'OUT' ? !v.supplierId : true), {
    message: 'У списания не должно быть поставщика',
    path: ['supplierId'],
  });
export type CreateMovementBatchInput = z.infer<typeof createMovementBatchInputSchema>;
