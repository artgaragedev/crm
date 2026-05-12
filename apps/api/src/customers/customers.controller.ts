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
  createCustomerInputSchema,
  paginationQuerySchema,
  updateCustomerInputSchema,
  type AuthUser,
  type CreateCustomerInput,
  type UpdateCustomerInput,
} from '@art-garage/shared';
import { ZodValidationPipe } from '../common/zod.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { CustomersService } from './customers.service';

const listQuerySchema = paginationQuerySchema.extend({
  includeDeleted: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
});
type ListQuery = z.infer<typeof listQuerySchema>;

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
    return this.customers.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customers.findOne(id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCustomerInputSchema)) input: CreateCustomerInput,
  ) {
    return this.customers.create(input, user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCustomerInputSchema)) input: UpdateCustomerInput,
  ) {
    return this.customers.update(id, input, user.id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customers.remove(id, user.id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customers.restore(id, user.id);
  }
}
