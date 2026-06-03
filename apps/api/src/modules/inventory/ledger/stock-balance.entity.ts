import { Entity, Column, Unique, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { ItemEntity } from '../location/item.entity';

/** Denormalized current stock quantity per item per location. Updated on every ledger posting. */
@Entity('stock_balances')
@Unique(['organizationId', 'itemId', 'locationId'])
@Index(['organizationId', 'branchId'])
@Index('IDX_stock_balances_org_branch_item', ['organizationId', 'branchId', 'itemId'])
export class StockBalanceEntity extends BaseEntity {
  @Column({ name: 'item_id', type: 'uuid', comment: 'The item being tracked' })
  itemId: string;

  @ManyToOne(() => ItemEntity, { nullable: true })
  @JoinColumn({ name: 'item_id' })
  item?: ItemEntity;

  @Column({ name: 'location_id', type: 'uuid', comment: 'The location holding the stock' })
  locationId: string;

  @Column({ type: 'numeric', default: 0, comment: 'Current on-hand quantity; can be negative in rare adjustment scenarios' })
  quantity: number;

  @Column({ name: 'last_movement_at', type: 'timestamptz', nullable: true, comment: 'Timestamp of the most recent stock movement affecting this balance' })
  lastMovementAt?: Date;
}
