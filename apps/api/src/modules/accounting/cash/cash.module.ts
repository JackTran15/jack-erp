import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JournalModule } from '../journal/journal.module';
import { CashAccountEntity } from './cash-account.entity';
import { CashMovementEntity } from './cash-movement.entity';
import { CashService } from './cash.service';
import { CashController } from './cash.controller';
import { PosSessionEntity } from '../../pos/entities/pos-session.entity';
import { CashFromPaymentPublisher } from '../publishers/cash-from-payment.publisher';

@Module({
  imports: [
    TypeOrmModule.forFeature([CashAccountEntity, CashMovementEntity, PosSessionEntity]),
    JournalModule,
  ],
  controllers: [CashController],
  providers: [CashService, CashFromPaymentPublisher],
  // CashFromPaymentConsumer relocated to cash-vouchers/cash-voucher-consumers/
  // pos-cash-sale.consumer.ts (now creates the Phiếu thu voucher too).
  exports: [CashService, CashFromPaymentPublisher],
})
export class CashModule {}
