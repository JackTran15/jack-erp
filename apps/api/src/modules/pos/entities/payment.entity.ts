import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { PaymentMethod } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { SaleEntity } from './sale.entity';

/** Payment tendered against a POS sale. Supports split tender (multiple payments per sale). */
@Entity('pos_payments')
@Index(['saleId'])
export class PaymentEntity extends BaseEntity {
  @Column({ name: 'sale_id', type: 'uuid', comment: 'The sale this payment applies to' })
  saleId: string;

  @ManyToOne(() => SaleEntity, (sale) => sale.payments)
  @JoinColumn({ name: 'sale_id' })
  sale: SaleEntity;

  @Column({ type: 'enum', enum: PaymentMethod, comment: 'Payment method used (CASH, CARD, CREDIT, OTHER)' })
  method: PaymentMethod;

  @Column({ type: 'numeric', precision: 18, scale: 2, comment: 'Amount tendered' })
  amount: number;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: 'External reference (card auth code, credit account ID, etc.)' })
  reference?: string;
}
