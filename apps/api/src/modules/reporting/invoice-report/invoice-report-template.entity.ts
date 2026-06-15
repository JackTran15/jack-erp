import { ReportTemplateColumn } from '@erp/shared-interfaces';
import { Column, DeleteDateColumn, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

/**
 * A saved invoice-report layout: its own set of columns + filters, shared
 * across the organization (no per-user visibility in v1). ORGANIZATION-scoped,
 * soft-deleted.
 */
@Entity('invoice_report_templates')
@Index(
  'uq_invoice_report_templates_org_type_name',
  ['organizationId', 'reportType', 'name'],
  { unique: true, where: '"deleted_at" IS NULL' },
)
@Index('idx_invoice_report_templates_org_sort', ['organizationId', 'sortOrder'])
export class InvoiceReportTemplateEntity extends BaseEntity {
  /** The report type this template belongs to (ReportDefinition.key). */
  @Column({ name: 'report_type', type: 'varchar', length: 80 })
  reportType: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  /**
   * Configured columns: per-column `{ col, displayName, visible, frozen, order }`
   * records (`col` = fixed registry key or dynamic `payment.method.<coaAccountId>`).
   */
  @Column({ type: 'jsonb', default: () => "'[]'" })
  columns: ReportTemplateColumn[];

  /** Saved filter set — scope filters plus `{ columnFilters }`. Shape = InvoiceReportFilterPayload + columnFilters. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  filters: Record<string, unknown>;

  @Column({ name: 'sort_order', type: 'integer', default: 0 })
  sortOrder: number;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date | null;
}
