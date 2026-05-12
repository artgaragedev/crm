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
  createCategoryInputSchema,
  paginationQuerySchema,
  updateCategoryInputSchema,
  type AuthUser,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from '@art-garage/shared';
import { ZodValidationPipe } from '../common/zod.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { CategoriesService } from './categories.service';

const listQuerySchema = paginationQuerySchema.extend({
  includeDeleted: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v === 'true'),
});
type ListQuery = z.infer<typeof listQuerySchema>;

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  list(@Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
    return this.categories.list(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.categories.findOne(id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCategoryInputSchema)) input: CreateCategoryInput,
  ) {
    return this.categories.create(input, user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCategoryInputSchema)) input: UpdateCategoryInput,
  ) {
    return this.categories.update(id, input, user.id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.categories.remove(id, user.id);
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.categories.restore(id, user.id);
  }
}
