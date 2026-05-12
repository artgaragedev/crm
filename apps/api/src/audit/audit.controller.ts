import { Controller, Get, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod.dto';
import { AuditService, type AuditEntity } from './audit.service';

const entitySchema = z.enum(['Product', 'Variant', 'Category', 'Lot', 'Customer', 'Supplier']);

const querySchema = z.object({
  entity: entitySchema,
  entityId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query(new ZodValidationPipe(querySchema)) q: z.infer<typeof querySchema>) {
    return this.audit.listForEntity(q.entity as AuditEntity, q.entityId, q.limit ?? 100);
  }
}
