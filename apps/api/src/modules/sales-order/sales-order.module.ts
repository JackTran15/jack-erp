import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerEntity } from '../customer/customer.entity';
import { DocumentNumberingModule } from '../document-numbering/document-numbering.module';
import { ItemEntity } from '../inventory/location/item.entity';
import { EmployeeProfileEntity } from '../rbac/employee/employee-profile.entity';
import { RbacModule } from '../rbac/rbac.module';
import { SalesOrderLineEntity } from './entities/sales-order-line.entity';
import { SalesOrderEntity } from './entities/sales-order.entity';
import { SalesOrderController } from './sales-order.controller';
import { SalesOrderService } from './sales-order.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SalesOrderEntity, SalesOrderLineEntity, EmployeeProfileEntity, CustomerEntity, ItemEntity]),
    DocumentNumberingModule,
    RbacModule,
  ],
  controllers: [SalesOrderController],
  providers: [SalesOrderService],
  exports: [SalesOrderService],
})
export class SalesOrderModule {}
