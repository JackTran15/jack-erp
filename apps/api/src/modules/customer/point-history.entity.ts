import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity';

export enum PointType { EARN = 'earn', REDEEM = 'redeem', ADJUST = 'adjust' }

/** Immutable ledger of all point transactions against a membership card. */
@Entity('point_history')
@Index(['cardId'])
export class PointHistoryEntity extends BaseEntity {
  @Column({ name: 'card_id', type: 'uuid' })
  cardId: string;

  @Column({ name: 'invoice_id', type: 'uuid', nullable: true })
  invoiceId?: string;

  @Column({ type: 'enum', enum: PointType })
  type: PointType;

  @Column({ type: 'int' })
  delta: number;

  @Column({ type: 'text', nullable: true })
  note?: string;
}
