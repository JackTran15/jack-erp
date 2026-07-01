import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountEntity } from '../coa/account.entity';
import { PaymentAccountEntity } from './payment-account.entity';
import { AccountingDefaultAccountEntity } from './accounting-default-account.entity';
import { AccountResolverService } from './account-resolver.service';
import { PaymentAccountsService } from './payment-accounts.service';
import { PaymentAccountsController } from './payment-accounts.controller';
import { DefaultAccountSeederService } from '../seeders/default-account.seeder';

/**
 * Payment-account & default-account config module. Exposes
 * {@link AccountResolverService} so sale/cash posting resolves COA accounts
 * server-side instead of trusting client-supplied account IDs, and a read-only
 * `/payment-accounts` endpoint so the POS can let cashiers pick a configured
 * account (e.g. which bank a transfer went into).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentAccountEntity,
      AccountingDefaultAccountEntity,
      AccountEntity,
    ]),
  ],
  controllers: [PaymentAccountsController],
  providers: [
    AccountResolverService,
    PaymentAccountsService,
    DefaultAccountSeederService,
  ],
  exports: [AccountResolverService, DefaultAccountSeederService],
})
export class PaymentAccountsModule {}
