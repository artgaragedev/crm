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
  createProductWithMatrixInputSchema,
  createProductWithVariantInputSchema,
  createVariantInputSchema,
  extendProductWithMatrixInputSchema,
  paginationQuerySchema,
  updateVariantInputSchema,
  type AuthUser,
  type CreateProductWithMatrixInput,
  type CreateProductWithVariantInput,
  type CreateVariantInput,
  type ExtendProductWithMatrixInput,
  type UpdateVariantInput,
} from '@art-garage/shared';
import { ZodValidationPipe } from '../common/zod.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { VariantsService } from './variants.service';
import { StockMovementsService } from '../stock-movements/stock-movements.service';

const listQuerySchema = paginationQuerySchema.extend({
  productId: z.string().optional(),
  categoryId: z.string().optional(),
});
type ListQuery = z.infer<typeof listQuerySchema>;

const removeQuerySchema = z.object({
  cascadeProduct: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
});

@Controller('variants')
export class VariantsController {
  constructor(
    private readonly variants: VariantsService,
    private readonly movements: StockMovementsService,
  ) {}

  @Get()
  list(@Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
    return this.variants.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.variants.findOne(id);
  }

  @Get(':id/lots')
  lots(@Param('id') id: string) {
    return this.movements.lotsForVariant(id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createVariantInputSchema)) input: CreateVariantInput,
  ) {
    return this.variants.create(input, user.id);
  }

  @Post('with-product')
  createWithProduct(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createProductWithVariantInputSchema))
    input: CreateProductWithVariantInput,
  ) {
    return this.variants.createWithProduct(input, user.id);
  }

  @Post('with-matrix')
  createWithMatrix(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createProductWithMatrixInputSchema))
    input: CreateProductWithMatrixInput,
  ) {
    return this.variants.createProductWithMatrix(input, user.id);
  }

  @Post('extend-matrix')
  extendWithMatrix(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(extendProductWithMatrixInputSchema))
    input: ExtendProductWithMatrixInput,
  ) {
    return this.variants.extendProductWithMatrix(input, user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateVariantInputSchema)) input: UpdateVariantInput,
  ) {
    return this.variants.update(id, input, user.id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(removeQuerySchema)) query: { cascadeProduct: boolean },
  ) {
    return this.variants.remove(id, query.cascadeProduct, user.id);
  }
}
