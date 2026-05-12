import { Module } from '@nestjs/common';
import { VariantsController } from './variants.controller';
import { VariantsService } from './variants.service';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [StockMovementsModule, ProductsModule],
  controllers: [VariantsController],
  providers: [VariantsService],
  exports: [VariantsService],
})
export class VariantsModule {}
