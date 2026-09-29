import { Module, OnModuleInit } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntityRegistryService } from '../crud/entity-registry.service';
import { CustomerEntity } from '../customer/customer.entity';
import { DocumentNumberingModule } from '../document-numbering/document-numbering.module';
import { GeoModule } from '../geo/geo.module';
import { ItemEntity } from '../inventory/location/item.entity';
import { InvoiceEntity } from '../pos/entities/invoice.entity';
import { PosModule } from '../pos/pos.module';
import { EmployeeProfileEntity } from '../rbac/employee/employee-profile.entity';
import { RbacModule } from '../rbac/rbac.module';
import { DeliveryPartnerEntity } from './entities/delivery-partner.entity';
import { SalesChannelEntity } from './entities/sales-channel.entity';
import { SalesOrderDispatchEventEntity } from './entities/sales-order-dispatch-event.entity';
import { SalesOrderLineEntity } from './entities/sales-order-line.entity';
import { SalesOrderEntity } from './entities/sales-order.entity';
import {
  SALES_CHANNEL_ENTITY_CONFIG,
  SALES_CHANNEL_SERVICE_TOKEN,
  SalesChannelCrudService,
} from './sales-channel-crud.service';
import {
  DELIVERY_PARTNER_ENTITY_CONFIG,
  DELIVERY_PARTNER_SERVICE_TOKEN,
  DeliveryPartnerCrudService,
} from './delivery-partner-crud.service';
import { AdminSalesOrderController } from './controllers/admin-sales-order.controller';
import { BranchSalesOrderV2Controller } from './controllers/branch-sales-order-v2.controller';
import { MobileDeliveryPartnerController, MobileSalesChannelController } from './controllers/mobile-sales-channel.controller';
import { PartnerOrderV2Controller } from './controllers/partner-order-v2.controller';
import { SearchBranchSalesOrdersHandler } from './queries/search-branch-sales-orders.handler';
import { SalesOrderController } from './sales-order.controller';
import { SalesOrderHistoryService } from './sales-order-history.service';
import { SalesOrderService } from './sales-order.service';
import { StockAvailabilityService } from './stock-availability.service';

@Module({
  imports: [
    // `SalesOrderDispatchEventEntity` không có repository nào được inject — vết
    // điều phối chỉ ghi bằng `manager` BÊN TRONG transaction phân đơn. Nó vẫn
    // phải nằm ở đây: `autoLoadEntities` nạp metadata từ chính `forFeature`, và
    // thiếu nó thì `manager.insert(SalesOrderDispatchEventEntity, …)` ném
    // "No metadata found" ngay lượt phân đơn đầu tiên.
    TypeOrmModule.forFeature([SalesOrderEntity, SalesOrderLineEntity, SalesOrderDispatchEventEntity, SalesChannelEntity, DeliveryPartnerEntity, EmployeeProfileEntity, CustomerEntity, ItemEntity, InvoiceEntity]),
    DocumentNumberingModule,
    RbacModule,
    // `InvoiceService.createDraftIn` + `PosSessionService.findOpenForBranch` cho `approve` (ADR-31/32).
    PosModule,
    // `GeoService` cho cửa ghi đối tác: tra tên tỉnh/phường chốt xuống đơn (ADR-05).
    GeoModule,
    // `QueryBus` cho lưới đơn POS (ADR-03).
    CqrsModule,
  ],
  controllers: [SalesOrderController, AdminSalesOrderController, PartnerOrderV2Controller, MobileSalesChannelController, MobileDeliveryPartnerController, BranchSalesOrderV2Controller],
  providers: [
    SalesOrderService,
    // Đối chiếu tồn (ADR-09) — đọc `stock_balances` qua `DataSource`/`manager`.
    StockAvailabilityService,
    // Lịch sử đơn ghép lúc đọc (ADR-14) — đọc qua `DataSource`, không ghi gì.
    SalesOrderHistoryService,
    SalesChannelCrudService,
    SearchBranchSalesOrdersHandler,
    { provide: SALES_CHANNEL_SERVICE_TOKEN, useExisting: SalesChannelCrudService },
    DeliveryPartnerCrudService,
    { provide: DELIVERY_PARTNER_SERVICE_TOKEN, useExisting: DeliveryPartnerCrudService },
  ],
  exports: [SalesOrderService],
})
export class SalesOrderModule implements OnModuleInit {
  constructor(private readonly entityRegistry: EntityRegistryService) {}

  /**
   * Đăng ký kênh bán vào nền CRUD generic — đây là tất cả những gì cần để có
   * `/admin/entities/sales-channels/records` và route backoffice
   * `/admin/sales-channels`. Không dựng controller hay trang riêng.
   */
  onModuleInit(): void {
    this.entityRegistry.registerEntity(
      SALES_CHANNEL_ENTITY_CONFIG,
      SALES_CHANNEL_SERVICE_TOKEN,
    );
    // Đối tác giao hàng (ADR-02) — `/admin/entities/delivery-partners/records`.
    this.entityRegistry.registerEntity(
      DELIVERY_PARTNER_ENTITY_CONFIG,
      DELIVERY_PARTNER_SERVICE_TOKEN,
    );
  }
}
