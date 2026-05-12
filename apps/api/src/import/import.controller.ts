import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import { productUnitSchema, type AuthUser } from '@art-garage/shared';
import { ZodValidationPipe } from '../common/zod.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { ImportService } from './import.service';

const importRowSchema = z.object({
  productName: z.string().trim().min(1).max(200),
  unit: productUnitSchema.optional(),
  categoryName: z.string().trim().max(100).optional().nullable(),
  sku: z.string().trim().min(1).max(64),
  color: z.string().trim().max(50).optional(),
  attributes: z.record(z.string(), z.string()).optional(),
  price: z.number().nonnegative().optional().nullable(),
  reorderLevel: z.number().int().nonnegative().optional().nullable(),
  initialStock: z.number().nonnegative().optional(),
  supplierName: z.string().trim().max(200).optional().nullable(),
  description: z.string().max(2000).optional(),
});

const importInputSchema = z.object({
  rows: z.array(importRowSchema).min(1).max(2000),
});

@Controller('import')
export class ImportController {
  constructor(private readonly importer: ImportService) {}

  @Roles('ADMIN')
  @Post('variants')
  importVariants(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(importInputSchema)) input: z.infer<typeof importInputSchema>,
  ) {
    return this.importer.importVariants(input.rows, user.id);
  }
}
