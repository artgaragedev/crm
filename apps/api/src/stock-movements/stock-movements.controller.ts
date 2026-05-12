import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  createMovementBatchInputSchema,
  createStockMovementInputSchema,
  movementTypeSchema,
  paginationQuerySchema,
  type AuthUser,
  type CreateMovementBatchInput,
  type CreateStockMovementInput,
} from '@art-garage/shared';
import { ZodValidationPipe } from '../common/zod.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { StockMovementsService } from './stock-movements.service';

const listQuerySchema = paginationQuerySchema.extend({
  variantId: z.string().optional(),
  type: movementTypeSchema.optional(),
});
type ListQuery = z.infer<typeof listQuerySchema>;

const reverseInputSchema = z.object({
  note: z.string().max(1000).optional(),
});
type ReverseInput = z.infer<typeof reverseInputSchema>;

@Controller('stock-movements')
export class StockMovementsController {
  constructor(private readonly movements: StockMovementsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
    return this.movements.list(query);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createStockMovementInputSchema))
    input: CreateStockMovementInput,
  ) {
    return this.movements.create(user.id, input);
  }

  /** Батчевое создание: один документ — много строк (приходная накладная и т.п.). */
  @Post('batch')
  createBatch(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createMovementBatchInputSchema))
    input: CreateMovementBatchInput,
  ) {
    return this.movements.createBatch(user.id, input);
  }

  /**
   * Сторнировать движение: создаёт обратное движение, ссылающееся на оригинал.
   * Это правильный способ "отменить" движение — без потери истории.
   */
  @Post(':id/reverse')
  reverse(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(reverseInputSchema)) input: ReverseInput,
  ) {
    return this.movements.reverse(user.id, id, input.note);
  }
}
