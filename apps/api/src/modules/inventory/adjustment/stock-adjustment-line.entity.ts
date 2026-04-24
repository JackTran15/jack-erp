import { Entity, Column, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { StockAdjustmentEntity } from './stock-adjustment.entity';

@Entity('stock_adjustment_lines')
export class StockAdjustmentLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'adjustment_id', type: 'uuid' })
  adjustmentId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  /** Signed: positive for increase, negative for decrease */
  @Column({ type: 'numeric' })
  quantity: number;

  @Column({ nullable: true })
  notes?: string;

  @ManyToOne(() => StockAdjustmentEntity, (adj) => adj.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'adjustment_id' })
  adjustment?: StockAdjustmentEntity;
}
