import { z } from 'zod';
import { productSchema } from './product';
import { variantAttributeValueSchema } from './attribute';

/**
 * Атрибуты вариации — JSON-снапшот: { "COLOR": "RED", "SIZE": "M" }.
 * Ключи — code атрибута (UPPER), значения — value (UPPER).
 * ИСТОЧНИК ПРАВДЫ — реляционная связь через variantAttributeValues, JSON это denorm cache.
 */
export const variantAttributesSchema = z.record(z.string(), z.string());
export type VariantAttributes = z.infer<typeof variantAttributesSchema>;

export const variantSchema = z.object({
  id: z.string(),
  productId: z.string(),
  sku: z.string(),
  attributes: variantAttributesSchema,
  /** Реляционные значения с раскрытыми label/swatch для UI. Источник правды. */
  attributeValues: z.array(variantAttributeValueSchema).optional(),
  price: z.number().nonnegative().nullable(),
  reorderLevel: z.number().int().nonnegative().nullable(),
  currentStock: z.number(),
  // Для плоского списка приходит вложенный родитель.
  product: productSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Variant = z.infer<typeof variantSchema>;

/**
 * Список выбранных значений вариации.
 * Каждый элемент — пара (attributeId, attributeValueId). Один attributeId не может встретиться дважды.
 */
export const variantAttributeValueRefSchema = z.object({
  attributeId: z.string().min(1),
  attributeValueId: z.string().min(1),
});
export type VariantAttributeValueRef = z.infer<typeof variantAttributeValueRefSchema>;

const variantAttributeValuesArraySchema = z
  .array(variantAttributeValueRefSchema)
  .refine(
    (arr) => new Set(arr.map((r) => r.attributeId)).size === arr.length,
    'У вариации не может быть двух значений по одной оси',
  );

export const createVariantInputSchema = z.object({
  productId: z.string().min(1),
  /** Если не задан или пустой — сервер сгенерирует из артикула товара и кодов значений. */
  sku: z.string().trim().max(64).optional(),
  /** Реляционные значения. Если заданы — будут синхронизированы с JSON snapshot. */
  attributeValues: variantAttributeValuesArraySchema.optional(),
  /** Legacy: свободный JSON. Используется когда attributeValues не заданы (импорт, ручное создание без справочника). */
  attributes: variantAttributesSchema.optional().default({}),
  price: z.number().nonnegative().optional().nullable(),
  reorderLevel: z.number().int().nonnegative().optional().nullable(),
});
export type CreateVariantInput = z.infer<typeof createVariantInputSchema>;

export const updateVariantInputSchema = z.object({
  sku: z.string().trim().min(1).max(64).optional(),
  attributeValues: variantAttributeValuesArraySchema.optional(),
  attributes: variantAttributesSchema.optional(),
  price: z.number().nonnegative().optional().nullable(),
  reorderLevel: z.number().int().nonnegative().optional().nullable(),
});
export type UpdateVariantInput = z.infer<typeof updateVariantInputSchema>;

/**
 * Создание родителя + первой вариации одной транзакцией.
 * Используется когда в форме toggle "новый товар".
 */
export const createProductWithVariantInputSchema = z.object({
  product: z.object({
    name: z.string().trim().min(1).max(200),
    unit: z.enum(['PCS', 'KG', 'L', 'M', 'PACK']),
    description: z.string().max(2000).optional(),
    categoryId: z.string().optional().nullable(),
  }),
  variant: z.object({
    /** Если не задан или пустой — сервер сгенерирует из имени товара и атрибутов. */
    sku: z.string().trim().max(64).optional(),
    attributeValues: variantAttributeValuesArraySchema.optional(),
    attributes: variantAttributesSchema.optional().default({}),
    price: z.number().nonnegative().optional().nullable(),
    reorderLevel: z.number().int().nonnegative().optional().nullable(),
  }),
});
export type CreateProductWithVariantInput = z.infer<typeof createProductWithVariantInputSchema>;

/**
 * Создание вариативного товара матрицей в одной транзакции:
 * Product + ProductAttribute[] + ProductVariant[] (с привязкой VariantAttributeValue).
 *
 *   - axes:     какие атрибуты у товара, в каком порядке.
 *   - variants: явный список вариантов; обычно матрица декартова произведения,
 *               но клиент может исключить отдельные комбинации (`enabled: false` → не отправлять).
 */
export const createProductWithMatrixInputSchema = z.object({
  product: z.object({
    name: z.string().trim().min(1).max(200),
    unit: z.enum(['PCS', 'KG', 'L', 'M', 'PACK']),
    description: z.string().max(2000).optional(),
    categoryId: z.string().optional().nullable(),
  }),
  /** Список осей в порядке появления в SKU и в UI. attributeId должны быть уникальны. */
  axes: z
    .array(
      z.object({
        attributeId: z.string().min(1),
        position: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .refine(
      (arr) => new Set(arr.map((a) => a.attributeId)).size === arr.length,
      'Дубль оси в axes',
    ),
  /** Перечень создаваемых вариантов. Каждый — комбинация значений по всем осям из axes. */
  variants: z
    .array(
      z.object({
        /** Каждое axes имеет ровно одно соответствие здесь. */
        values: variantAttributeValuesArraySchema,
        /** Если пуст — сгенерируется. */
        sku: z.string().trim().max(64).optional(),
        price: z.number().nonnegative().optional().nullable(),
        reorderLevel: z.number().int().nonnegative().optional().nullable(),
      }),
    )
    .min(1),
});
export type CreateProductWithMatrixInput = z.infer<typeof createProductWithMatrixInputSchema>;
