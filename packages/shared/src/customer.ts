import { z } from 'zod';

export const customerSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().email().nullable(),
  note: z.string().nullable(),
  /** Постоянная скидка клиента в процентах (0–100). Применяется автоматически в OUT-движениях. */
  discountPercent: z.number().min(0).max(100),
  deletedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Customer = z.infer<typeof customerSchema>;

export const createCustomerInputSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  note: z.string().max(2000).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerInputSchema>;

export const updateCustomerInputSchema = createCustomerInputSchema.partial();
export type UpdateCustomerInput = z.infer<typeof updateCustomerInputSchema>;
