import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentNumberingModule } from '../../document-numbering/document-numbering.module';
import { TransferOrderEntity } from './transfer-order.entity';
import { TransferOrderLineEntity } from './transfer-order-line.entity';
import { TransferOrderService } from './transfer-order.service';
import { TransferOrderController } from './transfer-order.controller';
import { TransferOrderV2Controller } from './controllers/transfer-order-v2.controller';
import { SearchTransferOrdersV2Handler } from './queries/search-transfer-orders-v2.handler';

@Module({
  imports: [
    CqrsModule,
    TypeOrmModule.forFeature([TransferOrderEntity, TransferOrderLineEntity]),
    DocumentNumberingModule,
  ],
  controllers: [TransferOrderController, TransferOrderV2Controller],
  providers: [TransferOrderService, SearchTransferOrdersV2Handler],
  exports: [TransferOrderService],
})
export class TransferOrderModule {}
