import { ReportTemplateColumn } from '@erp/shared-interfaces';
import { Column, DeleteDateColumn, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

/**
 * A saved report layout: its own set of columns + filters, shared by everyone in
 * its scope (no per-user visibility in v1). Soft-deleted. Generic across report
 * domains — `reportType` holds either an invoice report key
 * (daily-sales-summary, …) or an inventory report key (inventory-stock-summary,
 * …); each domain's handlers validate against their own registry.
 *
 * Scope is two-tiered (ADR-01): `branchId === null` is the chain default that any
 * branch without its own row inherits; a non-null `branchId` overrides it for
 * that branch. Resolve scope through `template-scope.ts` rather than filtering by
 * `organizationId` alone.
 *
 * The uniqueness rule — `(organizationId, COALESCE(branchId, ''), reportType,
 * name)` where not soft-deleted — lives in migration
 * `AddBranchScopeToReportTemplates1789400000000`. It is not declared here because
 * the `COALESCE` expression has no TypeORM decorator form, and without it two
 * NULL branch ids would not collide.
 */
@Entity('report_templates')
@Index('idx_report_templates_org_sort', ['organizationId', 'sortOrder'])
export class ReportTemplateEntity extends BaseEntity {
  /** The report type this template belongs to (ReportDefinition.key). */
  @Column({ name: 'report_type', type: 'varchar', length: 80 })
  reportType: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  /**
   * Configured columns: per-column `{ col, displayName, visible, frozen, order }`
   * records (`col` = fixed registry key or a dynamic key such as
   * `payment.method.<coaAccountId>` / `branch.qty.<branchId>`).
   */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  columns: ReportTemplateColumn[];

  /** Saved filter set — scope filters plus `{ columnFilters }`. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  filters: Record<string, unknown>;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date | null;
}
