import { z } from 'zod';

export const userRoleSchema = z.enum(['ADMIN', 'STAFF']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const registerInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  name: z.string().min(1).max(100),
  role: userRoleSchema.default('STAFF'),
});
export type RegisterInput = z.infer<typeof registerInputSchema>;

export const authUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: userRoleSchema,
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authResponseSchema = z.object({
  accessToken: z.string(),
  user: authUserSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;
