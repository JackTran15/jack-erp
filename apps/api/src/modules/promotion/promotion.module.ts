import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { DiscountCodeEntity } from './discount-code.entity';
import { VoucherEntity } from './voucher.entity';
import { PromotionEntity } from './promotion.entity';
import { InvoicePromotionEntity } from './invoice-promotion.entity';
import { InvoiceEntity } from '../pos/entities/invoice.entity';
import { DiscountCodeService } from './discount-code.service';
import { VoucherService } from './voucher.service';
import { PromotionService } from './promotion.service';
import { PromotionApplyService } from './promotion-apply.service';
import { PromotionController } from './promotion.controller';
import {
  PromotionProgramEntity,
  PromotionGroupEntity,
  PromotionLineEntity,
  PromotionTierEntity,
  PromotionConditionEntity,
  PromotionBranchEntity,
  PromotionCustomerGroupEntity,
} from './infrastructure/entities';
import { TypeormPromotionRepository } from './infrastructure/repositories/typeorm-promotion.repository';
import { TypeormCatalogReader } from './infrastructure/repositories/typeorm-catalog-reader';
import { TypeormCustomerReader } from './infrastructure/repositories/typeorm-customer-reader';
import { PROMOTION_REPOSITORY } from './domain/ports/promotion-repository.port';
import { CATALOG_READER } from './domain/ports/catalog-reader.port';
import { CUSTOMER_READER } from './domain/ports/customer-reader.port';
import { ItemEntity } from '../inventory/location/item.entity';
import { ItemCategoryEntity } from '../inventory/location/item-category.entity';
import { ProductEntity } from '../inventory/product/product.entity';
import { CustomerEntity } from '../customer/customer.entity';
import { MembershipCardEntity } from '../customer/membership-card.entity';
import { MembershipCardTypeEntity } from '../customer/membership-card-type.entity';
import { DocumentNumberingModule } from '../document-numbering/document-numbering.module';
import { PromotionV2Controller } from './interface/promotion-v2.controller';
import { VoucherV2Controller } from './interface/voucher-v2.controller';
import { CreatePromotionHandler } from './application/commands/create-promotion.handler';
import { UpdatePromotionHandler } from './application/commands/update-promotion.handler';
import { DuplicatePromotionHandler } from './application/commands/duplicate-promotion.handler';
import { ChangePromotionStatusHandler } from './application/commands/change-promotion-status.handler';
import { DeletePromotionHandler } from './application/commands/delete-promotion.handler';
import { SearchPromotionsV2Handler } from './application/queries/search-promotions-v2.handler';
import { GetPromotionHandler } from './application/queries/get-promotion.handler';
import { EvaluateCartHandler } from './application/queries/evaluate-cart.handler';
import { SearchVouchersV2Handler } from './application/queries/search-vouchers-v2.handler';
import { PromotionResolver } from './domain/engine/promotion-resolver';

const COMMAND_HANDLERS = [
  CreatePromotionHandler,
  UpdatePromotionHandler,
  DuplicatePromotionHandler,
  ChangePromotionStatusHandler,
  DeletePromotionHandler,
];

const QUERY_HANDLERS = [SearchPromotionsV2Handler, GetPromotionHandler, EvaluateCartHandler, SearchVouchersV2Handler];

@Module({
  imports: [
    CqrsModule,
    DocumentNumberingModule,
    TypeOrmModule.forFeature([
      // Legacy (unchanged) — kept alongside the v2 clean-arch subtree, not replaced.
      DiscountCodeEntity,
      VoucherEntity,
      PromotionEntity,
      InvoicePromotionEntity,
      InvoiceEntity,
      // v2 promotion-programs schema (TKT-KM-02)
      PromotionProgramEntity,
      PromotionGroupEntity,
      PromotionLineEntity,
      PromotionTierEntity,
      PromotionConditionEntity,
      PromotionBranchEntity,
      PromotionCustomerGroupEntity,
      // Cross-module entities read by TypeormCatalogReader / TypeormCustomerReader / GetPromotionHandler
      ItemEntity,
      ItemCategoryEntity,
      ProductEntity,
      CustomerEntity,
      MembershipCardEntity,
      MembershipCardTypeEntity,
    ]),
  ],
  controllers: [PromotionController, PromotionV2Controller, VoucherV2Controller],
  providers: [
    DiscountCodeService,
    VoucherService,
    PromotionService,
    PromotionApplyService,
    { provide: PROMOTION_REPOSITORY, useClass: TypeormPromotionRepository },
    { provide: CATALOG_READER, useClass: TypeormCatalogReader },
    { provide: CUSTOMER_READER, useClass: TypeormCustomerReader },
    PromotionResolver,
    ...COMMAND_HANDLERS,
    ...QUERY_HANDLERS,
  ],
  exports: [DiscountCodeService, VoucherService, PromotionService, PromotionApplyService],
})
export class PromotionModule {}
