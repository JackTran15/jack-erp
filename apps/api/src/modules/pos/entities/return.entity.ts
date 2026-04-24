import { Entity, Column, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { ReturnLineEntity } from './return-line.entity';

@Entity('pos_returns')
@Index('uq_return_doc_number', ['organizationId', 'documentNumber'], {
  unique: true,
})
@Index(['organizationId', 'originalSaleId'])
@Index(['organizationId', 'sessionId'])
@Index(['organizationId', 'branchId', 'returnDate'])
export class ReturnEntity extends BaseEntity {
  @Column({ name: 'document_number', length: 100 })
  documentNumber: string;

  @Column({ name: 'original_sale_id', type: 'uuid' })
  originalSaleId: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
  })
  subtotal: number;

  @Column({
    name: 'tax_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
  })
  taxAmount: number;

  @Column({
    name: 'total_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
  })
  totalAmount: number;

  @Column({ type: 'text' })
  reason: string;

  @Column({ name: 'return_date', type: 'timestamptz' })
  returnDate: Date;

  @OneToMany(() => ReturnLineEntity, (line) => line.returnDoc, {
    cascade: true,
  })
  lines: ReturnLineEntity[];
}
