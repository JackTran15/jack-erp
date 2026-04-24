import { Entity, Column, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { StockTransferEntity } from './stock-transfer.entity';

/** Single item line within a stock transfer document. */
@Entity('stock_transfer_lines')
export class StockTransferLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'transfer_id', type: 'uuid', comment: 'Parent transfer document' })
  transferId: string;

  @Column({ name: 'item_id', type: 'uuid', comment: 'The item being transferred' })
  itemId: string;

  @Column({ type: 'numeric', comment: 'Quantity to transfer (always positive)' })
  quantity: number;

  @Column({ nullable: true, comment: 'Per-line notes' })
  notes?: string;

  @ManyToOne(() => StockTransferEntity, (transfer) => transfer.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'transfer_id' })
  transfer?: StockTransferEntity;
}
