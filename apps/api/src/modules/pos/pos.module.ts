import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentNumberingModule } from '../document-numbering/document-numbering.module';
import { StockLedgerModule } from '../inventory/ledger/stock-ledger.module';
import { AccountingModule } from '../accounting/accounting.module';
import { WebSocketModule } from '../websocket/websocket.module';
import {
  PosSessionEntity,
  SaleEntity,
  SaleLineEntity,
  PaymentEntity,
  ReturnEntity,
  ReturnLineEntity,
  SessionReconciliationEntity,
} from './entities';
import {
  PosSessionService,
  CheckoutService,
  ReturnService,
  ExchangeService,
  PosCatalogService,
} from './services';
import { PosController } from './pos.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PosSessionEntity,
      SaleEntity,
      SaleLineEntity,
      PaymentEntity,
      ReturnEntity,
      ReturnLineEntity,
      SessionReconciliationEntity,
    ]),
    DocumentNumberingModule,
    StockLedgerModule,
    AccountingModule,
    WebSocketModule,
  ],
  controllers: [PosController],
  providers: [
    PosSessionService,
    CheckoutService,
    ReturnService,
    ExchangeService,
    PosCatalogService,
  ],
  exports: [
    PosSessionService,
    CheckoutService,
    ReturnService,
    ExchangeService,
  ],
})
export class PosModule {}
