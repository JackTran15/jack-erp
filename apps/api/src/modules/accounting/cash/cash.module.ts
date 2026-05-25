import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JournalModule } from '../journal/journal.module';
import { CashAccountEntity } from './cash-account.entity';
import { CashMovementEntity } from './cash-movement.entity';
import { CashService } from './cash.service';
import { CashFundResolverService } from './cash-fund-resolver.service';
import { BranchCashProvisioningService } from './branch-cash-provisioning.service';
import { CashController } from './cash.controller';
import { PosSessionEntity } from '../../pos/entities/pos-session.entity';
import { CashFromPaymentPublisher } from '../publishers/cash-from-payment.publisher';
import { CashRefundPublisher } from '../publishers/cash-refund.publisher';
import { CashRefundConsumer } from '../consumers/cash-refund.consumer';

@Module({
  imports: [
    TypeOrmModule.forFeature([CashAccountEntity, CashMovementEntity, PosSessionEntity]),
    JournalModule,
  ],
  controllers: [CashController],
  providers: [
    CashService,
    CashFundResolverService,
    BranchCashProvisioningService,
    CashFromPaymentPublisher,
    CashRefundPublisher,
    CashRefundConsumer,
  ],
  exports: [
    CashService,
    CashFundResolverService,
    BranchCashProvisioningService,
    CashFromPaymentPublisher,
    CashRefundPublisher,
  ],
})
export class CashModule {}
