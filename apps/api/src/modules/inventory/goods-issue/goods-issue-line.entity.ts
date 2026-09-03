import { Entity, Column, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { GoodsIssueEntity } from './goods-issue.entity';
import { ItemEntity } from '../location/item.entity';
import { LocationEntity } from '../location/location.entity';

/** Single item line within a goods issue document. */
@Entity('goods_issue_lines')
export class GoodsIssueLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'goods_issue_id', type: 'uuid', comment: 'Parent goods issue document' })
  goodsIssueId: string;

  /**
   * 1-based position of this line within its voucher — the order the user typed.
   * Explicit rather than derived: this table has no `created_at`, and ordering by
   * the uuid primary key gives an arbitrary permutation (ADR-01). Unique per
   * `goods_issue_id`, and every write path must set it.
   */
  @Column({ name: 'line_no', type: 'int', comment: '1-based position of the line within its voucher' })
  lineNo: number;

  @Column({ name: 'item_id', type: 'uuid', comment: 'Item being issued from stock' })
  itemId: string;

  @Column({ name: 'location_id', type: 'uuid', comment: 'Source bin/location the stock is issued from' })
  locationId: string;

  @Column({ type: 'numeric', comment: 'Quantity to issue (always positive)' })
  quantity: number;

  @Column({ name: 'unit_price', type: 'numeric', precision: 18, scale: 2, default: 0 })
  unitPrice: string;

  @Column({ name: 'line_total', type: 'numeric', precision: 18, scale: 2, default: 0 })
  lineTotal: string;

  @Column({ nullable: true, comment: 'Per-line notes' })
  notes?: string;

  @ManyToOne(() => GoodsIssueEntity, (gi) => gi.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'goods_issue_id' })
  goodsIssue?: GoodsIssueEntity;

  @ManyToOne(() => ItemEntity, { eager: true })
  @JoinColumn({ name: 'item_id' })
  item?: ItemEntity;

  @ManyToOne(() => LocationEntity, { eager: true })
  @JoinColumn({ name: 'location_id' })
  location?: LocationEntity;
}
