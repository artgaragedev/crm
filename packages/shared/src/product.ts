import { z } from 'zod';
import { categorySchema } from './category';

export const productUnitSchema = z.enum(['PCS', 'KG', 'L', 'M', 'PACK']);
export type ProductUnit = z.infer<typeof productUnitSchema>;

/**
 * Родительский товар: модель ("BOTTLE COLBY"). Несёт name, category, description, unit.
 * Конкретные SKU/цены/остатки живут на ProductVariant.
 */
export const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Артикул товара для 1С. Назначается автоматически при создании. */
  code: z.string().nullable().optional(),
  description: z.string().nullable(),
  unit: productUnitSchema,
  categoryId: z.string().nullable(),
  category: categorySchema.nullable().optional(),
  variantCount: z.number().int().nonnegative().optional(),
  totalStock: z.number().optional(),
  deletedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Product = z.infer<typeof productSchema>;

export const createProductInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  unit: productUnitSchema,
  description: z.string().max(2000).optional(),
  categoryId: z.string().optional().nullable(),
});
export type CreateProductInput = z.infer<typeof createProductInputSchema>;

export const updateProductInputSchema = createProductInputSchema.partial();
export type UpdateProductInput = z.infer<typeof updateProductInputSchema>;
