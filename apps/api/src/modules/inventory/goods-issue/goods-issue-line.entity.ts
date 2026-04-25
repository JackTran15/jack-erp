import { Entity, Column, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { GoodsIssueEntity } from './goods-issue.entity';

/** Single item line within a goods issue document. */
@Entity('goods_issue_lines')
export class GoodsIssueLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'goods_issue_id', type: 'uuid', comment: 'Parent goods issue document' })
  goodsIssueId: string;

  @Column({ name: 'item_id', type: 'uuid', comment: 'Item being issued from stock' })
  itemId: string;

  @Column({ type: 'numeric', comment: 'Quantity to issue (always positive)' })
  quantity: number;

  @Column({ nullable: true, comment: 'Per-line notes' })
  notes?: string;

  @ManyToOne(() => GoodsIssueEntity, (gi) => gi.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'goods_issue_id' })
  goodsIssue?: GoodsIssueEntity;
}
