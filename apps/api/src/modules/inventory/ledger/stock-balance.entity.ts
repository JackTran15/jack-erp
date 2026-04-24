import { Entity, Column, Unique, Index } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

/** Denormalized current stock quantity per item per location. Updated on every ledger posting. */
@Entity('stock_balances')
@Unique(['organizationId', 'itemId', 'locationId'])
@Index(['organizationId', 'branchId'])
export class StockBalanceEntity extends BaseEntity {
  @Column({ name: 'item_id', type: 'uuid', comment: 'The item being tracked' })
  itemId: string;

  @Column({ name: 'location_id', type: 'uuid', comment: 'The location holding the stock' })
  locationId: string;

  @Column({ type: 'numeric', default: 0, comment: 'Current on-hand quantity; can be negative in rare adjustment scenarios' })
  quantity: number;

  @Column({ name: 'last_movement_at', type: 'timestamptz', nullable: true, comment: 'Timestamp of the most recent stock movement affecting this balance' })
  lastMovementAt?: Date;
}
