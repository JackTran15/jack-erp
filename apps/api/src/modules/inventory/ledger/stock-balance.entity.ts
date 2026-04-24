import { Entity, Column, Unique, Index } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

@Entity('stock_balances')
@Unique(['organizationId', 'itemId', 'locationId'])
@Index(['organizationId', 'branchId'])
export class StockBalanceEntity extends BaseEntity {
  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'location_id', type: 'uuid' })
  locationId: string;

  @Column({ type: 'numeric', default: 0 })
  quantity: number;

  @Column({ name: 'last_movement_at', type: 'timestamptz', nullable: true })
  lastMovementAt?: Date;
}
