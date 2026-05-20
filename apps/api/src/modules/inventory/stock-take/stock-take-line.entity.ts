import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StockTakeEntity } from './stock-take.entity';
import { ItemEntity } from '../location/item.entity';
import { LocationEntity } from '../location/location.entity';

@Entity('stock_take_lines')
export class StockTakeLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @Column({ name: 'branch_id', nullable: true })
  branchId?: string;

  @Column({ name: 'stock_take_id', type: 'uuid' })
  stockTakeId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'location_id', type: 'uuid' })
  locationId: string;

  @Column({ name: 'expected_qty', type: 'numeric', precision: 18, scale: 3, default: 0 })
  expectedQty: string;

  @Column({ name: 'counted_qty', type: 'numeric', precision: 18, scale: 3, nullable: true })
  countedQty?: string | null;

  @Column({ type: 'text', nullable: true })
  note?: string;

  /** Nguyên nhân — reason text for the variance on this line. */
  @Column({ type: 'text', nullable: true })
  reason?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'created_by' })
  createdBy: string;

  @ManyToOne(() => StockTakeEntity, (st) => st.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stock_take_id' })
  stockTake: StockTakeEntity;

  @ManyToOne(() => ItemEntity, { eager: true })
  @JoinColumn({ name: 'item_id' })
  item?: ItemEntity;

  @ManyToOne(() => LocationEntity, { eager: true })
  @JoinColumn({ name: 'location_id' })
  location?: LocationEntity;
}
