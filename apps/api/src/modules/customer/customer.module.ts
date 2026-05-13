import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntityRegistryService } from '../crud/entity-registry.service';
import { CustomerEntity } from './customer.entity';
import { CustomerGroupEntity } from './customer-group.entity';
import { MembershipCardEntity } from './membership-card.entity';
import { PointHistoryEntity } from './point-history.entity';
import { CustomerCreditEntity } from './customer-credit.entity';
import {
  CustomerService,
  CUSTOMER_SERVICE_TOKEN,
  CUSTOMER_ENTITY_CONFIG,
} from './customer.service';
import { CustomerGroupService } from './customer-group.service';
import { MembershipCardService } from './services/membership-card.service';
import { CustomerCreditService } from './services/customer-credit.service';
import { CustomerController } from './customer.controller';
import { LoyaltyPointsPublisher } from './publishers/loyalty-points.publisher';
import { LoyaltyPointsConsumer } from './consumers/loyalty-points.consumer';
import { LoyaltyPointsReversePublisher } from './publishers/loyalty-points-reverse.publisher';
import { LoyaltyPointsReverseConsumer } from './consumers/loyalty-points-reverse.consumer';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CustomerEntity,
      CustomerGroupEntity,
      MembershipCardEntity,
      PointHistoryEntity,
      CustomerCreditEntity,
    ]),
  ],
  controllers: [CustomerController],
  providers: [
    CustomerService,
    { provide: CUSTOMER_SERVICE_TOKEN, useExisting: CustomerService },
    CustomerGroupService,
    MembershipCardService,
    LoyaltyPointsPublisher,
    LoyaltyPointsConsumer,
    LoyaltyPointsReversePublisher,
    LoyaltyPointsReverseConsumer,
    CustomerCreditService,
  ],
  exports: [
    CustomerService,
    MembershipCardService,
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
  }
}
