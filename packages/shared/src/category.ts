import { z } from 'zod';

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex string like #3b82f6');

/** Короткий код-префикс категории для SKU: "BTL", "MUG", "PEN". Только A-Z, 0-9, дефис. */
export const categoryCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(10)
  .regex(/^[A-Z0-9-]+$/, 'Код только из латиницы, цифр и дефисов');

export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string().nullable(),
  color: z.string().nullable(),
  deletedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Category = z.infer<typeof categorySchema>;

export const createCategoryInputSchema = z.object({
  name: z.string().min(1).max(100),
  color: hexColorSchema.optional(),
  code: categoryCodeSchema.optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategoryInputSchema>;

export const updateCategoryInputSchema = createCategoryInputSchema.partial().extend({
  /** Можно явно очистить null'ом. */
  code: categoryCodeSchema.nullable().optional(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategoryInputSchema>;
