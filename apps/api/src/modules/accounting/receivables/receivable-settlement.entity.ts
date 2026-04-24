import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { ReceivableEntity } from './receivable.entity';

@Entity('receivable_settlements')
@Index('idx_receivable_settlement_receivable', ['receivableId'])
export class ReceivableSettlementEntity extends BaseEntity {
  @Column({ name: 'receivable_id', type: 'uuid' })
  receivableId: string;

  @ManyToOne(() => ReceivableEntity, (r) => r.settlements)
  @JoinColumn({ name: 'receivable_id' })
  receivable: ReceivableEntity;

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
