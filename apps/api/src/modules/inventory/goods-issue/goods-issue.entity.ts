import { Entity, Column, OneToMany, Index } from 'typeorm';
import { GoodsIssueStatus } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { GoodsIssueLineEntity } from './goods-issue-line.entity';

/** Phiếu xuất hàng — goods issue from stock. Workflow: DRAFT → APPROVED → POSTED | CANCELLED */
@Entity('goods_issues')
@Index(['organizationId', 'status'])
export class GoodsIssueEntity extends BaseEntity {
  @Column({ name: 'document_number', nullable: true, unique: true, comment: 'Auto-generated on posting' })
  documentNumber?: string;

  @Column({ name: 'location_id', type: 'uuid', comment: 'Source storage location' })
  locationId: string;

  @Column({ comment: 'Reason for issuance (e.g. bán hàng, nội bộ, mẫu)' })
  reason: string;

  @Column({ type: 'enum', enum: GoodsIssueStatus, default: GoodsIssueStatus.DRAFT })
  status: GoodsIssueStatus;

  @Column({ nullable: true, comment: 'Free-text notes' })
  notes?: string;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy?: string;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt?: Date;

  @Column({ name: 'posted_by', type: 'uuid', nullable: true })
  postedBy?: string;

  @Column({ name: 'posted_at', type: 'timestamptz', nullable: true })
  postedAt?: Date;

  @OneToMany(() => GoodsIssueLineEntity, (line) => line.goodsIssue, {
    cascade: ['insert'],
    eager: true,
  })
  lines: GoodsIssueLineEntity[];
}
