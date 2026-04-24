import { Entity, Column, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { SaleLineEntity } from './sale-line.entity';
import { PaymentEntity } from './payment.entity';

export enum SaleStatus {
  COMPLETED = 'COMPLETED',
  RETURNED = 'RETURNED',
  PARTIALLY_RETURNED = 'PARTIALLY_RETURNED',
}

@Entity('pos_sales')
@Index('uq_sale_doc_number', ['organizationId', 'documentNumber'], {
  unique: true,
})
@Index(['organizationId', 'sessionId'])
@Index(['organizationId', 'branchId', 'saleDate'])
@Index(['organizationId', 'customerId'])
export class SaleEntity extends BaseEntity {
  @Column({ name: 'document_number', length: 100 })
  documentNumber: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId?: string;

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

  @Column({
    type: 'enum',
    enum: SaleStatus,
    default: SaleStatus.COMPLETED,
  })
  status: SaleStatus;

  @Column({ name: 'sale_date', type: 'timestamptz' })
  saleDate: Date;

  @OneToMany(() => SaleLineEntity, (line) => line.sale, { cascade: true })
  lines: SaleLineEntity[];

  @OneToMany(() => PaymentEntity, (payment) => payment.sale, { cascade: true })
  payments: PaymentEntity[];
}
