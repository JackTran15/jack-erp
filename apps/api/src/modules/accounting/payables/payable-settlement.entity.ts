import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { PayableEntity } from './payable.entity';

@Entity('payable_settlements')
@Index('idx_payable_settlement_payable', ['payableId'])
export class PayableSettlementEntity extends BaseEntity {
  @Column({ name: 'payable_id', type: 'uuid' })
  payableId: string;

  @ManyToOne(() => PayableEntity, (p) => p.settlements)
  @JoinColumn({ name: 'payable_id' })
  payable: PayableEntity;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
  })
  amount: number;

  @Column({ name: 'settlement_date', type: 'date' })
  settlementDate: string;

  @Column({ length: 50 })
  method: string;

  @Column({ length: 255, nullable: true })
  reference?: string;
}
