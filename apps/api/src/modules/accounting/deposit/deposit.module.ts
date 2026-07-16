import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntityRegistryService } from '../../crud/entity-registry.service';
import { JournalModule } from '../journal/journal.module';
import { CashModule } from '../cash/cash.module';
import { BankEntity } from './bank.entity';
import { DepositAccountEntity } from './deposit-account.entity';
import { DepositMovementEntity } from './deposit-movement.entity';
import { DepositPaymentPolicyEntity } from './deposit-payment-policy.entity';
import { DepositService } from './deposit.service';
import { DepositFundResolverService } from './deposit-fund-resolver.service';
import { DepositRoutingService } from './deposit-routing.service';
import { DepositFromPaymentPublisher } from './deposit-from-payment.publisher';
import { PosDepositSaleConsumer } from './consumers/pos-deposit-sale.consumer';
import { DepositFeeService } from '../deposit-fee/deposit-fee.service';
import { DepositLedgerService } from './deposit-ledger/deposit-ledger.service';
import { DepositLedgerController } from './deposit-ledger/deposit-ledger.controller';
import { DepositBalanceService } from './deposit-ledger/deposit-balance.service';
import { DepositPeriodLockEntity } from '../deposit-period-lock/deposit-period-lock.entity';
import { DepositPeriodGuardService } from '../deposit-period-lock/deposit-period-guard.service';
import { DepositAuditModule } from '../deposit-audit/deposit-audit.module';
import {
  BanksCrudService,
  BANK_SERVICE_TOKEN,
  BANK_ENTITY_CONFIG,
} from './banks.crud';
import {
  DepositAccountsCrudService,
  DEPOSIT_ACCOUNT_SERVICE_TOKEN,
  DEPOSIT_ACCOUNT_ENTITY_CONFIG,
} from './deposit-accounts.crud';
import {
  DepositPaymentPolicyCrudService,
  DEPOSIT_PAYMENT_POLICY_SERVICE_TOKEN,
  DEPOSIT_PAYMENT_POLICY_ENTITY_CONFIG,
} from './deposit-payment-policy.crud';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BankEntity,
      DepositAccountEntity,
      DepositMovementEntity,
      DepositPaymentPolicyEntity,
      DepositPeriodLockEntity,
    ]),
    JournalModule,
    CashModule,
    DepositAuditModule,
  ],
  controllers: [DepositLedgerController],
  providers: [
    DepositService,
    DepositFundResolverService,
    DepositRoutingService,
    DepositFromPaymentPublisher,
    DepositFeeService,
    PosDepositSaleConsumer,
    DepositLedgerService,
    DepositBalanceService,
    DepositPeriodGuardService,
    BanksCrudService,
    { provide: BANK_SERVICE_TOKEN, useExisting: BanksCrudService },
    DepositAccountsCrudService,
    { provide: DEPOSIT_ACCOUNT_SERVICE_TOKEN, useExisting: DepositAccountsCrudService },
    DepositPaymentPolicyCrudService,
    {
      provide: DEPOSIT_PAYMENT_POLICY_SERVICE_TOKEN,
      useExisting: DepositPaymentPolicyCrudService,
    },
  ],
  exports: [
    DepositService,
    DepositFundResolverService,
    DepositRoutingService,
    DepositFromPaymentPublisher,
    DepositFeeService,
    DepositBalanceService,
    DepositPeriodGuardService,
  ],
})
export class DepositModule implements OnModuleInit {
  constructor(private readonly entityRegistry: EntityRegistryService) {}

  onModuleInit(): void {
    this.entityRegistry.registerEntity(BANK_ENTITY_CONFIG, BANK_SERVICE_TOKEN);
    this.entityRegistry.registerEntity(
      DEPOSIT_ACCOUNT_ENTITY_CONFIG,
      DEPOSIT_ACCOUNT_SERVICE_TOKEN,
    );
    this.entityRegistry.registerEntity(
      DEPOSIT_PAYMENT_POLICY_ENTITY_CONFIG,
      DEPOSIT_PAYMENT_POLICY_SERVICE_TOKEN,
    );
  }
}
