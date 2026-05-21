import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../../database/entities/base.entity';
import { CashReceiptEntity } from './cash-receipt.entity';

@Entity('cash_receipt_lines')
@Index('IDX_cash_receipt_lines_receipt', ['cashReceiptId'])
export class CashReceiptLineEntity extends BaseEntity {
  @Column({ name: 'cash_receipt_id', type: 'uuid' })
  cashReceiptId: string;

  @ManyToOne(() => CashReceiptEntity, (receipt) => receipt.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'cash_receipt_id' })
  cashReceipt: CashReceiptEntity;

  @Column({ name: 'line_order', type: 'int', default: 0 })
  lineOrder: number;

  @Column({ type: 'varchar', length: 500 })
  description: string;

  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId?: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  amount: number;

  @Column({ name: 'reference_note', type: 'varchar', length: 255, nullable: true })
  referenceNote?: string;
}
