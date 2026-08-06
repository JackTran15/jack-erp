import { Entity, Column, Index, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import type { LineDiscount, GiftOffer } from '@erp/shared-interfaces';

/**
 * Snapshot of one promotion programme that actually ran for one invoice,
 * taken inside the checkout transaction. Parity target / schema owner:
 * migration `1787800000002-AddInvoiceCheckoutPromotions.ts`.
 *
 * An audit record, not a live join — stores the code/name/type/priority and
 * computed amounts as they were at checkout time, so a later edit to (or
 * soft-delete of) the programme cannot rewrite history on a posted invoice.
 * That is also why this does not extend `BaseEntity`: the migration
 * deliberately has no `updated_at` column (these rows are insert-only), and
 * `BaseEntity` cannot have a column excluded once inherited (see
 * reference_typeorm_cannot_override_inherited_column) — so every column is
 * declared explicitly here instead, matching the migration byte for byte.
 *
 * Deliberately separate from the legacy `invoice_promotions` table, which
 * belongs to the v1 flow and is not touched by this epic.
 */
@Entity('invoice_checkout_promotions')
@Index('IDX_invoice_checkout_promotions_invoice', ['invoiceId'])
@Index('UQ_invoice_checkout_promotions_invoice_program', ['invoiceId', 'programId'], {
  unique: true,
})
@Index('IDX_invoice_checkout_promotions_org_program', ['organizationId', 'programId'])
export class InvoiceCheckoutPromotionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'varchar' })
  organizationId: string;

  @Column({ name: 'branch_id', type: 'varchar', nullable: true })
  branchId?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'created_by', type: 'varchar' })
  createdBy: string;

  @Column({ name: 'invoice_id', type: 'uuid' })
  invoiceId: string;

  @Column({ name: 'program_id', type: 'uuid' })
  programId: string;

  @Column({ type: 'varchar', length: 64 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  /** `PromotionProgramType` as stored — kept as a plain string here, same reasoning as the migration. */
  @Column({ type: 'varchar', length: 32 })
  type: string;

  @Column({ type: 'int' })
  priority: number;

  @Column({ name: 'discount_amount', type: 'numeric', precision: 18, scale: 2, default: 0 })
  discountAmount: number;

  @Column({ name: 'line_discounts', type: 'jsonb', nullable: true })
  lineDiscounts?: LineDiscount[];

  @Column({ type: 'jsonb', nullable: true })
  gifts?: GiftOffer[];
}
