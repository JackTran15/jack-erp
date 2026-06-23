import { Entity, Column, OneToMany, ManyToOne, JoinColumn, Index } from 'typeorm';
import {
  GoodsIssuePurpose,
  GoodsIssueReferenceType,
  GoodsIssueStatus,
  DocCounterpartyKind,
} from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { BranchEntity } from '../../branch/branch.entity';
import { IssueReasonEntity } from '../issue-reason/issue-reason.entity';
import { LocationEntity } from '../location/location.entity';
import { ProviderEntity } from '../location/provider.entity';
import { CounterpartyDisplay } from '../location/services/counterparty-name.util';
import { GoodsIssueLineEntity } from './goods-issue-line.entity';

/** Phiếu xuất hàng — goods issue from stock. Workflow: DRAFT → POSTED | CANCELLED */
@Entity('goods_issues')
@Index(['organizationId', 'status'])
@Index('IDX_goods_issues_org_branch_list', ['organizationId', 'branchId', 'status', 'createdAt'])
export class GoodsIssueEntity extends BaseEntity {
  @Column({ name: 'document_number', nullable: true, unique: true, comment: 'Auto-generated on posting' })
  documentNumber?: string;

  @Column({ name: 'location_id', type: 'uuid', comment: 'Source storage location' })
  locationId: string;

  @ManyToOne(() => LocationEntity, { eager: true })
  @JoinColumn({ name: 'location_id' })
  location?: LocationEntity;

  @Column({ name: 'provider_id', type: 'uuid', nullable: true, comment: 'FK to providers — the "Đối tượng" counterparty (NCC/đối tác)' })
  providerId?: string;

  @ManyToOne(() => ProviderEntity, { eager: true, nullable: true })
  @JoinColumn({ name: 'provider_id' })
  provider?: ProviderEntity;

  @Column({
    name: 'counterparty_kind',
    type: 'enum',
    enum: DocCounterpartyKind,
    enumName: 'doc_counterparty_kind_enum',
    nullable: true,
    comment: 'Đối tượng kind for v2 issues: supplier (NCC) or customer (KH)',
  })
  counterpartyKind?: DocCounterpartyKind | null;

  @Column({
    name: 'counterparty_id',
    type: 'uuid',
    nullable: true,
    comment: 'Id of the provider or customer, per counterpartyKind',
  })
  counterpartyId?: string | null;

  @Column({ comment: 'Denormalized reason text (auto-filled from reasonRef.name or targetBranch.name)' })
  reason: string;

  @Column({ name: 'reason_id', type: 'uuid', nullable: true, comment: 'FK to issue_reasons — required for purpose=OTHER|DISPOSAL' })
  reasonId?: string;

  @ManyToOne(() => IssueReasonEntity, { eager: true, nullable: true })
  @JoinColumn({ name: 'reason_id' })
  reasonRef?: IssueReasonEntity;

  @Column({ name: 'target_branch_id', type: 'uuid', nullable: true, comment: 'FK to branches — required for purpose=TRANSFER_OUT' })
  targetBranchId?: string;

  @ManyToOne(() => BranchEntity, { eager: true, nullable: true })
  @JoinColumn({ name: 'target_branch_id' })
  targetBranch?: BranchEntity;

  @Column({ type: 'enum', enum: GoodsIssueStatus, default: GoodsIssueStatus.DRAFT })
  status: GoodsIssueStatus;

  @Column({ type: 'enum', enum: GoodsIssuePurpose, default: GoodsIssuePurpose.OTHER, comment: 'Mục đích xuất kho: OTHER | SALE | TRANSFER_OUT | DISPOSAL' })
  purpose: GoodsIssuePurpose;

  @Column({ name: 'reference_id', type: 'uuid', nullable: true, comment: 'Source document id (e.g. the stock-take that generated this issue)' })
  referenceId?: string;

  @Column({ name: 'reference_type', type: 'varchar', nullable: true, comment: 'Source document type — see GoodsIssueReferenceType (Tham chiếu KK)' })
  referenceType?: GoodsIssueReferenceType;

  @Column({ nullable: true, comment: 'Free-text notes' })
  notes?: string;

  @Column({ type: 'varchar', nullable: true, comment: 'Free-text deliverer name (Người giao)' })
  deliverer?: string | null;

  @Column({ name: 'references', type: 'jsonb', default: () => "'[]'::jsonb", comment: 'FE-supplied reference codes shown as Tham chiếu' })
  references: string[];

  @Column({ name: 'occurred_at', type: 'timestamptz', nullable: true, comment: 'User-entered issue date+time; falls back to createdAt' })
  occurredAt?: Date | null;

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

  /**
   * Transient (not a column): the resolved "Đối tượng" { kind, id, code, name }
   * inlined by the v2 search handler / getById so customer and employee
   * counterparties (no provider join) render their name instead of "—".
   */
  counterparty?: CounterpartyDisplay | null;
}
