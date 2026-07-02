import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentNumberingModule } from '../document-numbering/document-numbering.module';
import { EntityRegistryService } from '../crud/entity-registry.service';
import { CustomerEntity } from './customer.entity';
import { CustomerGroupEntity } from './customer-group.entity';
import { MembershipCardEntity } from './membership-card.entity';
import { MembershipCardTypeEntity } from './membership-card-type.entity';
import { PointHistoryEntity } from './point-history.entity';
import { CustomerCreditEntity } from './customer-credit.entity';
import { InvoiceEntity } from '../pos/entities/invoice.entity';
import { InvoiceDebtEntity } from '../pos/entities/invoice-debt.entity';
import {
  CustomerService,
  CUSTOMER_SERVICE_TOKEN,
  CUSTOMER_ENTITY_CONFIG,
} from './customer.service';
import { CustomerGroupService } from './customer-group.service';
import { MembershipCardService } from './services/membership-card.service';
import { CustomerCreditService } from './services/customer-credit.service';
import { CustomerSummaryService } from './services/customer-summary.service';
import {
  MembershipCardTypeService,
  MEMBERSHIP_CARD_TYPE_SERVICE_TOKEN,
  MEMBERSHIP_CARD_TYPE_ENTITY_CONFIG,
} from './services/membership-card-type.service';
import { MembershipCardTypeSeederService } from './services/membership-card-type.seeder';
import { CustomerController } from './customer.controller';
import { LoyaltyPointsPublisher } from './publishers/loyalty-points.publisher';
import { LoyaltyPointsConsumer } from './consumers/loyalty-points.consumer';
import { LoyaltyPointsReversePublisher } from './publishers/loyalty-points-reverse.publisher';
import { LoyaltyPointsReverseConsumer } from './consumers/loyalty-points-reverse.consumer';

@Module({
  imports: [
    DocumentNumberingModule,
    TypeOrmModule.forFeature([
      CustomerEntity,
      CustomerGroupEntity,
      MembershipCardEntity,
      MembershipCardTypeEntity,
      PointHistoryEntity,
      CustomerCreditEntity,
      InvoiceEntity,
      InvoiceDebtEntity,
    ]),
  ],
  controllers: [CustomerController],
  providers: [
    CustomerService,
    { provide: CUSTOMER_SERVICE_TOKEN, useExisting: CustomerService },
    CustomerGroupService,
    MembershipCardService,
    MembershipCardTypeService,
    { provide: MEMBERSHIP_CARD_TYPE_SERVICE_TOKEN, useExisting: MembershipCardTypeService },
    MembershipCardTypeSeederService,
    LoyaltyPointsPublisher,
    LoyaltyPointsConsumer,
    LoyaltyPointsReversePublisher,
    LoyaltyPointsReverseConsumer,
    CustomerCreditService,
    CustomerSummaryService,
  ],
  exports: [
    CustomerService,
    MembershipCardService,
    MembershipCardTypeSeederService,
    LoyaltyPointsPublisher,
    LoyaltyPointsReversePublisher,
    CustomerCreditService,
  ],
})
export class CustomerModule implements OnModuleInit {
  constructor(
    private readonly entityRegistry: EntityRegistryService,
  ) {}

  onModuleInit(): void {
    this.entityRegistry.registerEntity(
      CUSTOMER_ENTITY_CONFIG,
      CUSTOMER_SERVICE_TOKEN,
    );
    this.entityRegistry.registerEntity(
      MEMBERSHIP_CARD_TYPE_ENTITY_CONFIG,
      MEMBERSHIP_CARD_TYPE_SERVICE_TOKEN,
    );
  }
}
