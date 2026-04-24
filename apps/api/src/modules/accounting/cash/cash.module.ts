import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JournalModule } from '../journal/journal.module';
import { CashAccountEntity } from './cash-account.entity';
import { CashMovementEntity } from './cash-movement.entity';
import { CashService } from './cash.service';
import { CashController } from './cash.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([CashAccountEntity, CashMovementEntity]),
    JournalModule,
  ],
  controllers: [CashController],
  providers: [CashService],
  exports: [CashService],
})
export class CashModule {}
