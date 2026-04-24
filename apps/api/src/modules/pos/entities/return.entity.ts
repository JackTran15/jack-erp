import { Entity, Column, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { ReturnLineEntity } from './return-line.entity';

/** Return transaction against a previously completed sale. Triggers stock restoration and updates sale status. */
@Entity('pos_returns')
@Index('uq_return_doc_number', ['organizationId', 'documentNumber'], {
  unique: true,
})
@Index(['organizationId', 'originalSaleId'])
@Index(['organizationId', 'sessionId'])
@Index(['organizationId', 'branchId', 'returnDate'])
export class ReturnEntity extends BaseEntity {
  @Column({ name: 'document_number', length: 100, comment: 'Auto-generated return receipt number' })
  documentNumber: string;

  @Column({ name: 'original_sale_id', type: 'uuid', comment: 'The original sale being returned against' })
  originalSaleId: string;

  @Column({ name: 'session_id', type: 'uuid', comment: 'The current POS session processing the return' })
  sessionId: string;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    comment: 'Sum of return line totals before tax',
  })
  subtotal: number;

  @Column({
    name: 'tax_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    comment: 'Total tax refunded',
  })
  taxAmount: number;

  @Column({
    name: 'total_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    comment: 'Total refund amount',
  })
  totalAmount: number;

  @Column({ type: 'text', comment: 'Stated reason for the return' })
  reason: string;

  @Column({ name: 'return_date', type: 'timestamptz', comment: 'When the return was processed' })
  returnDate: Date;

  @OneToMany(() => ReturnLineEntity, (line) => line.returnDoc, {
    cascade: true,
  })
  lines: ReturnLineEntity[];
}
