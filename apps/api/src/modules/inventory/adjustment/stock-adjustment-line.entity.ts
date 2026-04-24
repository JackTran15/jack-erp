import { Entity, Column, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { StockAdjustmentEntity } from './stock-adjustment.entity';

/** Single item line in a stock adjustment. Quantity is signed: positive = increase, negative = decrease. */
@Entity('stock_adjustment_lines')
export class StockAdjustmentLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'adjustment_id', type: 'uuid', comment: 'Parent adjustment document' })
  adjustmentId: string;

  @Column({ name: 'item_id', type: 'uuid', comment: 'The item being adjusted' })
  itemId: string;

  /** Signed: positive for increase, negative for decrease */
  @Column({ type: 'numeric', comment: 'Signed quantity change: positive = increase, negative = decrease' })
  quantity: number;

  @Column({ nullable: true, comment: 'Per-line notes' })
  notes?: string;

  @ManyToOne(() => StockAdjustmentEntity, (adj) => adj.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'adjustment_id' })
  adjustment?: StockAdjustmentEntity;
}
