import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { z } from 'zod';
import { type AuthUser } from '@art-garage/shared';
import { ZodValidationPipe } from '../common/zod.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { LotsService, type UpdateLotInput } from './lots.service';

const updateLotInputSchema = z.object({
  unitCost: z.number().nonnegative().optional(),
  note: z.string().max(2000).nullable().optional(),
});

@Controller('lots')
export class LotsController {
  constructor(private readonly lots: LotsService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.lots.findOne(id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateLotInputSchema)) input: UpdateLotInput,
  ) {
    return this.lots.update(id, input, user.id);
  }
}
