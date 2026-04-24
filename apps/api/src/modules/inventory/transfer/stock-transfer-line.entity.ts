import { Entity, Column, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { StockTransferEntity } from './stock-transfer.entity';

@Entity('stock_transfer_lines')
export class StockTransferLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'transfer_id', type: 'uuid' })
  transferId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ type: 'numeric' })
  quantity: number;

  @Column({ nullable: true })
  notes?: string;

  @ManyToOne(() => StockTransferEntity, (transfer) => transfer.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'transfer_id' })
  transfer?: StockTransferEntity;
}
