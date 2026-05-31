import { Entity, Column, Unique, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { SupplierGroupEntity } from './supplier-group.entity';

export enum ProviderType {
  ORGANIZATION = 'organization',
  INDIVIDUAL = 'individual',
}

/** Supplier / vendor who provides items to the organization. */
@Entity('inventory_providers')
@Unique(['organizationId', 'code'])
export class ProviderEntity extends BaseEntity {
  @Column({ comment: 'Short alphanumeric code unique per organization' })
  code: string;

  @Column({ comment: 'Human-readable provider name' })
  name: string;

  @Column({ nullable: true, comment: 'Contact email address' })
  email?: string;

  @Column({ nullable: true, comment: 'Contact phone number' })
  phone?: string;

  @Column({ nullable: true, comment: 'Free-text notes' })
  notes?: string;

  @Column({ name: 'is_active', default: true, comment: 'Inactive providers cannot be assigned to new items' })
  isActive: boolean;

  // ── Extended fields ──────────────────────────────────────────────────────

  @Column({
    type: 'enum',
    enum: ProviderType,
    default: ProviderType.ORGANIZATION,
    comment: 'Provider type: organization (Tổ chức) or individual (Cá nhân)',
  })
  type: ProviderType;

  @Column({ type: 'text', nullable: true, comment: 'Street / delivery address' })
  address?: string;

  @Column({ name: 'group_id', type: 'uuid', nullable: true, comment: 'FK to provider_groups' })
  groupId?: string;

  @ManyToOne(() => SupplierGroupEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'group_id' })
  group?: SupplierGroupEntity;

  /** Maximum outstanding debt in VND. Returned as string by pg (numeric type). */
  @Column({ name: 'max_debt', type: 'numeric', precision: 18, scale: 2, nullable: true, comment: 'Maximum outstanding debt limit (VND)' })
  maxDebt?: string;

  @Column({ name: 'debt_term_days', type: 'int', nullable: true, comment: 'Payment term in days' })
  debtTermDays?: number;

  @Column({ name: 'bank_name', nullable: true, comment: 'Bank name' })
  bankName?: string;

  @Column({ name: 'bank_account_number', nullable: true, comment: 'Bank account number' })
  bankAccountNumber?: string;

  @Column({ name: 'bank_branch', nullable: true, comment: 'Bank branch name' })
  bankBranch?: string;

  @Column({ name: 'is_customer', default: false, comment: 'When true, this provider is also a customer' })
  isCustomer: boolean;

  // ── Organization-only ────────────────────────────────────────────────────

  @Column({ name: 'tax_code', nullable: true, comment: 'Tax identification number (tổ chức only)' })
  taxCode?: string;

  @Column({ name: 'contact_title', nullable: true, comment: 'Contact person salutation (Ông/Bà)' })
  contactTitle?: string;

  @Column({ name: 'contact_name', nullable: true, comment: 'Contact person full name' })
  contactName?: string;

  @Column({ name: 'contact_email', nullable: true, comment: 'Contact person email' })
  contactEmail?: string;

  @Column({ name: 'contact_phone', nullable: true, comment: 'Contact person phone' })
  contactPhone?: string;

  @Column({ name: 'contact_position', nullable: true, comment: 'Contact person job title' })
  contactPosition?: string;

  @Column({ name: 'contact_address', type: 'text', nullable: true, comment: 'Contact person address' })
  contactAddress?: string;

  // ── Individual-only ──────────────────────────────────────────────────────

  @Column({ name: 'salutation', nullable: true, comment: 'Salutation for individual providers (Ông/Bà)' })
  salutation?: string;

  @Column({ name: 'id_card_number', nullable: true, comment: 'National ID / CMND number' })
  idCardNumber?: string;

  @Column({
    name: 'id_card_issue_date',
    type: 'date',
    nullable: true,
    transformer: {
      to: (v: string | undefined) => v || null,
      from: (v: Date | string | null) =>
        v ? new Date(v).toISOString().slice(0, 10) : undefined,
    },
    comment: 'Date national ID was issued (YYYY-MM-DD)',
  })
  idCardIssueDate?: string;

  @Column({ name: 'id_card_issue_place', nullable: true, comment: 'Place national ID was issued' })
  idCardIssuePlace?: string;
}
