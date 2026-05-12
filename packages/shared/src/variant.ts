import { z } from 'zod';
import { productSchema } from './product';

/**
 * Атрибуты вариации. Произвольный JSON: { color, size, material, ... }.
 * Ключи и значения — строки. Это даёт гибкость без миграций.
 */
export const variantAttributesSchema = z.record(z.string(), z.string());
export type VariantAttributes = z.infer<typeof variantAttributesSchema>;

export const variantSchema = z.object({
  id: z.string(),
  productId: z.string(),
  sku: z.string(),
  attributes: variantAttributesSchema,
  price: z.number().nonnegative().nullable(),
  reorderLevel: z.number().int().nonnegative().nullable(),
  currentStock: z.number(),
  // Для плоского списка приходит вложенный родитель.
  product: productSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Variant = z.infer<typeof variantSchema>;

export const createVariantInputSchema = z.object({
  productId: z.string().min(1),
  /** Если не задан или пустой — сервер сгенерирует из имени товара и атрибутов. */
  sku: z.string().trim().max(64).optional(),
  attributes: variantAttributesSchema.optional().default({}),
  price: z.number().nonnegative().optional().nullable(),
  reorderLevel: z.number().int().nonnegative().optional().nullable(),
});
export type CreateVariantInput = z.infer<typeof createVariantInputSchema>;

export const updateVariantInputSchema = z.object({
  sku: z.string().trim().min(1).max(64).optional(),
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
    attributes: variantAttributesSchema.optional().default({}),
    price: z.number().nonnegative().optional().nullable(),
    reorderLevel: z.number().int().nonnegative().optional().nullable(),
  }),
});
export type CreateProductWithVariantInput = z.infer<typeof createProductWithVariantInputSchema>;
