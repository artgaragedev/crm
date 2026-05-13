import { z } from 'zod';

/**
 * Справочник атрибутов вариативности. Глобальный: один "Цвет" на всю систему.
 *
 * Модель:
 *   Attribute (Цвет, Размер, Объём)
 *     └─ AttributeValue (Red, Black; M, L, XL; 500, 750, 1000)
 *   ProductAttribute (какие оси использует этот товар + порядок)
 *   VariantAttributeValue (конкретное значение по оси у конкретного варианта)
 */

export const attributeTypeSchema = z.enum(['TEXT', 'SWATCH', 'NUMBER']);
export type AttributeType = z.infer<typeof attributeTypeSchema>;

const attributeCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(16)
  .regex(/^[A-Z0-9_]+$/u, 'code: только A-Z, 0-9, _');

const valueCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(16)
  .regex(/^[A-Z0-9_]+$/u, 'code: только A-Z, 0-9, _');

const valueValueSchema = z
  .string()
  .trim()
  .min(1)
  .max(64);

export const attributeValueSchema = z.object({
  id: z.string(),
  attributeId: z.string(),
  value: z.string(),
  label: z.string().nullable(),
  code: z.string().nullable(),
  swatch: z.string().nullable(),
  sortOrder: z.number().int(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AttributeValueDto = z.infer<typeof attributeValueSchema>;

export const attributeSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  type: attributeTypeSchema,
  unit: z.string().nullable(),
  sortOrder: z.number().int(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  values: z.array(attributeValueSchema).optional(),
  /** Сколько товаров используют этот атрибут — заполняется при list. */
  productCount: z.number().int().nonnegative().optional(),
});
export type AttributeDto = z.infer<typeof attributeSchema>;

// ── Create / Update Attribute ──────────────────────────────────────────────

export const createAttributeInputSchema = z.object({
  name: z.string().trim().min(1).max(64),
  code: attributeCodeSchema,
  type: attributeTypeSchema.default('TEXT'),
  unit: z.string().trim().max(16).optional().nullable(),
  sortOrder: z.number().int().optional(),
});
export type CreateAttributeInput = z.infer<typeof createAttributeInputSchema>;

export const updateAttributeInputSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  code: attributeCodeSchema.optional(),
  type: attributeTypeSchema.optional(),
  unit: z.string().trim().max(16).optional().nullable(),
  sortOrder: z.number().int().optional(),
});
export type UpdateAttributeInput = z.infer<typeof updateAttributeInputSchema>;

// ── Create / Update AttributeValue ─────────────────────────────────────────

export const createAttributeValueInputSchema = z.object({
  value: valueValueSchema,
  label: z.string().trim().max(64).optional().nullable(),
  /** Если не задан — будет сгенерирован из value (uppercase, дефисы → '_'). */
  code: valueCodeSchema.optional(),
  swatch: z.string().trim().max(128).optional().nullable(),
  sortOrder: z.number().int().optional(),
});
export type CreateAttributeValueInput = z.infer<typeof createAttributeValueInputSchema>;

export const updateAttributeValueInputSchema = z.object({
  value: valueValueSchema.optional(),
  label: z.string().trim().max(64).optional().nullable(),
  code: valueCodeSchema.optional(),
  swatch: z.string().trim().max(128).optional().nullable(),
  sortOrder: z.number().int().optional(),
});
export type UpdateAttributeValueInput = z.infer<typeof updateAttributeValueInputSchema>;

// ── ProductAttribute / VariantAttributeValue (вложенные DTO) ───────────────

export const productAttributeSchema = z.object({
  attributeId: z.string(),
  position: z.number().int(),
  attribute: attributeSchema.optional(),
});
export type ProductAttributeDto = z.infer<typeof productAttributeSchema>;

export const variantAttributeValueSchema = z.object({
  attributeId: z.string(),
  attributeValueId: z.string(),
  attribute: attributeSchema.optional(),
  value: attributeValueSchema.optional(),
});
export type VariantAttributeValueDto = z.infer<typeof variantAttributeValueSchema>;
