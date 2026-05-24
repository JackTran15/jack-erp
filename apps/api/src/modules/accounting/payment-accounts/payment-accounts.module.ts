import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentAccountEntity } from './payment-account.entity';
import { AccountingDefaultAccountEntity } from './accounting-default-account.entity';

/**
 * Payment-account & default-account config module.
 *
 * Schema-only skeleton (TKT-2405-01). The controller, PaymentAccountService and
 * DefaultAccountResolverService are added in TKT-2405-02 / TKT-2405-03.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentAccountEntity,
      AccountingDefaultAccountEntity,
    ]),
  ],
})
export class PaymentAccountsModule {}
