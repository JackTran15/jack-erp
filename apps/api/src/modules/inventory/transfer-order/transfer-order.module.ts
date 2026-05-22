import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentNumberingModule } from '../../document-numbering/document-numbering.module';
import { TransferOrderEntity } from './transfer-order.entity';
import { TransferOrderLineEntity } from './transfer-order-line.entity';
import { TransferOrderService } from './transfer-order.service';
import { TransferOrderController } from './transfer-order.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransferOrderEntity, TransferOrderLineEntity]),
    DocumentNumberingModule,
  ],
  controllers: [TransferOrderController],
  providers: [TransferOrderService],
  exports: [TransferOrderService],
})
export class TransferOrderModule {}
