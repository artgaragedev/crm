import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/products.module';
import { VariantsModule } from './variants/variants.module';
import { CategoriesModule } from './categories/categories.module';
import { CustomersModule } from './customers/customers.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { StockMovementsModule } from './stock-movements/stock-movements.module';
import { LotsModule } from './lots/lots.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ReportsModule } from './reports/reports.module';
import { AuditModule } from './audit/audit.module';
import { ImportModule } from './import/import.module';
import { ExportModule } from './export/export.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Глобальный rate-limit: 60 запросов/мин с одного IP.
    // На /auth/login и /auth/register действует более строгое правило (см. @Throttle в контроллере).
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 60 },
    ]),
    PrismaModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    ProductsModule,
    VariantsModule,
    CustomersModule,
    SuppliersModule,
    StockMovementsModule,
    LotsModule,
    DashboardModule,
    ReportsModule,
    AuditModule,
    ImportModule,
    ExportModule,
  ],
  controllers: [HealthController],
  providers: [
    // Throttler первым в цепочке: брутфорс блокируется ещё до проверки JWT.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
