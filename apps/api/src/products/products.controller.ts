import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  createProductInputSchema,
  paginationQuerySchema,
  updateProductInputSchema,
  type AuthUser,
  type CreateProductInput,
  type UpdateProductInput,
} from '@art-garage/shared';
import { ZodValidationPipe } from '../common/zod.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { ProductsService } from './products.service';

const listQuerySchema = paginationQuerySchema.extend({
  categoryId: z.string().optional(),
  includeDeleted: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
});
type ListQuery = z.infer<typeof listQuerySchema>;

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
    return this.products.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.products.findOne(id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createProductInputSchema)) input: CreateProductInput,
  ) {
    return this.products.create(input, user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateProductInputSchema)) input: UpdateProductInput,
  ) {
    return this.products.update(id, input, user.id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.products.remove(id, user.id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.products.restore(id, user.id);
  }
}
