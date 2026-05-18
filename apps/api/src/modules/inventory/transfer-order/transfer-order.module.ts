import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransferOrderEntity } from './transfer-order.entity';
import { TransferOrderLineEntity } from './transfer-order-line.entity';
import { TransferOrderService } from './transfer-order.service';
import { TransferOrderController } from './transfer-order.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([TransferOrderEntity, TransferOrderLineEntity]),
  ],
  controllers: [TransferOrderController],
  providers: [TransferOrderService],
  exports: [TransferOrderService],
})
export class TransferOrderModule {}
