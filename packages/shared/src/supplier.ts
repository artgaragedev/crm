import { z } from 'zod';

export const supplierSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().email().nullable(),
  note: z.string().nullable(),
  deletedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Supplier = z.infer<typeof supplierSchema>;

export const createSupplierInputSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  note: z.string().max(2000).optional(),
});
export type CreateSupplierInput = z.infer<typeof createSupplierInputSchema>;

export const updateSupplierInputSchema = createSupplierInputSchema.partial();
export type UpdateSupplierInput = z.infer<typeof updateSupplierInputSchema>;
