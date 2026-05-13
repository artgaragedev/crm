import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  createAttributeInputSchema,
  createAttributeValueInputSchema,
  paginationQuerySchema,
  updateAttributeInputSchema,
  updateAttributeValueInputSchema,
  type AuthUser,
  type CreateAttributeInput,
  type CreateAttributeValueInput,
  type UpdateAttributeInput,
  type UpdateAttributeValueInput,
} from '@art-garage/shared';
import { ZodValidationPipe } from '../common/zod.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { AttributesService } from './attributes.service';

const listQuerySchema = paginationQuerySchema.extend({
  includeDeleted: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
});
type ListQuery = z.infer<typeof listQuerySchema>;

@Controller('attributes')
export class AttributesController {
  constructor(private readonly attributes: AttributesService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
    return this.attributes.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.attributes.findOne(id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createAttributeInputSchema)) input: CreateAttributeInput,
  ) {
    return this.attributes.create(input, user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAttributeInputSchema)) input: UpdateAttributeInput,
  ) {
    return this.attributes.update(id, input, user.id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.attributes.remove(id, user.id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.attributes.restore(id, user.id);
  }

  // ── Values ──────────────────────────────────────────────────────────────

  @Post(':id/values')
  createValue(
    @CurrentUser() user: AuthUser,
    @Param('id') attributeId: string,
    @Body(new ZodValidationPipe(createAttributeValueInputSchema))
    input: CreateAttributeValueInput,
  ) {
    return this.attributes.createValue(attributeId, input, user.id);
  }

  @Patch('values/:valueId')
  updateValue(
    @CurrentUser() user: AuthUser,
    @Param('valueId') valueId: string,
    @Body(new ZodValidationPipe(updateAttributeValueInputSchema))
    input: UpdateAttributeValueInput,
  ) {
    return this.attributes.updateValue(valueId, input, user.id);
  }

  @Delete('values/:valueId')
  @HttpCode(204)
  removeValue(@CurrentUser() user: AuthUser, @Param('valueId') valueId: string) {
    return this.attributes.removeValue(valueId, user.id);
  }
}
