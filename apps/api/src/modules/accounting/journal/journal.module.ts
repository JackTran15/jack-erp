import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentNumberingModule } from '../../document-numbering/document-numbering.module';
import { AccountEntity } from '../coa/account.entity';
import { JournalEntryEntity } from './journal-entry.entity';
import { JournalLineEntity } from './journal-line.entity';
import { JournalService } from './journal.service';
import { JournalController } from './journal.controller';
import { JournalSalePublisher } from '../publishers/journal-sale.publisher';
import { JournalSaleConsumer } from '../consumers/journal-sale.consumer';
import { JournalReverseConsumer } from '../consumers/journal-reverse.consumer';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      JournalEntryEntity,
      JournalLineEntity,
      AccountEntity,
    ]),
    DocumentNumberingModule,
  ],
  controllers: [JournalController],
  providers: [
    JournalService,
    JournalSalePublisher,
    JournalSaleConsumer,
    JournalReverseConsumer,
  ],
  exports: [JournalService, JournalSalePublisher],
})
export class JournalModule {}
