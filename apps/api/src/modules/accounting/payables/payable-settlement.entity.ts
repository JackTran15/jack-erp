import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { PayableEntity } from './payable.entity';

/** Records a single payment event against a payable. Multiple settlements for partial payments. */
@Entity('payable_settlements')
@Index('idx_payable_settlement_payable', ['payableId'])
export class PayableSettlementEntity extends BaseEntity {
  @Column({ name: 'payable_id', type: 'uuid', comment: 'The payable being paid' })
  payableId: string;

  @ManyToOne(() => PayableEntity, (p) => p.settlements)
  @JoinColumn({ name: 'payable_id' })
  payable: PayableEntity;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    comment: 'Amount of this payment',
  })
  amount: number;

  @Column({ name: 'settlement_date', type: 'date', comment: 'Date the payment was made' })
  settlementDate: string;

  @Column({ length: 50, comment: 'Payment method (e.g. CASH, BANK_TRANSFER, CHECK)' })
  method: string;

  @Column({ length: 255, nullable: true, comment: 'External reference (bank txn ID, check number, etc.)' })
  reference?: string;
}
