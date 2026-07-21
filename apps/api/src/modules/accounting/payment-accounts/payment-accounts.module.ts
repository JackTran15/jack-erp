import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntityRegistryService } from '../../crud/entity-registry.service';
import { AccountEntity } from '../coa/account.entity';
import { DepositAccountEntity } from '../deposit/deposit-account.entity';
import { BranchEntity } from '../../branch/branch.entity';
import { PaymentAccountEntity } from './payment-account.entity';
import { AccountingDefaultAccountEntity } from './accounting-default-account.entity';
import { AccountResolverService } from './account-resolver.service';
import { PaymentAccountsService } from './payment-accounts.service';
import { PaymentAccountsController } from './payment-accounts.controller';
import { DefaultAccountSeederService } from '../seeders/default-account.seeder';
import {
  PaymentAccountsCrudService,
  PAYMENT_ACCOUNT_SERVICE_TOKEN,
  PAYMENT_ACCOUNT_ENTITY_CONFIG,
} from './payment-accounts.crud';

/**
 * Payment-account & default-account config module. Exposes
 * {@link AccountResolverService} so sale/cash posting resolves COA accounts
 * server-side instead of trusting client-supplied account IDs, and a read-only
 * `/payment-accounts` endpoint so the POS can let cashiers pick a configured
 * account (e.g. which bank a transfer went into). Admin management of
 * `payment_accounts` rows is exposed separately via the generic CRUD platform
 * (`/admin/entities/payment-accounts/records`) — see {@link PaymentAccountsCrudService}.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentAccountEntity,
      AccountingDefaultAccountEntity,
      AccountEntity,
      DepositAccountEntity,
      // Registered so PaymentAccountsCrudService can resolve branch names for
      // the admin grid.
      BranchEntity,
    ]),
  ],
  controllers: [PaymentAccountsController],
  providers: [
    AccountResolverService,
    PaymentAccountsService,
    DefaultAccountSeederService,
    PaymentAccountsCrudService,
    { provide: PAYMENT_ACCOUNT_SERVICE_TOKEN, useExisting: PaymentAccountsCrudService },
  ],
  exports: [AccountResolverService, DefaultAccountSeederService],
})
export class PaymentAccountsModule implements OnModuleInit {
  constructor(private readonly entityRegistry: EntityRegistryService) {}

  onModuleInit(): void {
    this.entityRegistry.registerEntity(
      PAYMENT_ACCOUNT_ENTITY_CONFIG,
      PAYMENT_ACCOUNT_SERVICE_TOKEN,
    );
  }
}
