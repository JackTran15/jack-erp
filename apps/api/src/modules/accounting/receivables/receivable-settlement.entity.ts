import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { ReceivableEntity } from './receivable.entity';

/** Records a single payment received from a customer against a receivable. */
@Entity('receivable_settlements')
@Index('idx_receivable_settlement_receivable', ['receivableId'])
export class ReceivableSettlementEntity extends BaseEntity {
  @Column({ name: 'receivable_id', type: 'uuid', comment: 'The receivable being paid' })
  receivableId: string;

  @ManyToOne(() => ReceivableEntity, (r) => r.settlements)
  @JoinColumn({ name: 'receivable_id' })
  receivable: ReceivableEntity;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    comment: 'Payment amount received',
  })
  amount: number;

  @Column({ name: 'settlement_date', type: 'date', comment: 'Date payment was received' })
  settlementDate: string;

  @Column({ length: 50, comment: 'Payment method (e.g. CASH, BANK_TRANSFER)' })
  method: string;

  @Column({ length: 255, nullable: true, comment: 'External reference' })
  reference?: string;
}
