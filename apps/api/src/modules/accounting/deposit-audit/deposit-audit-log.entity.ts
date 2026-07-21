import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Entities an audit row can describe (NFR-05). */
export enum DepositAuditEntityType {
  DEPOSIT_MOVEMENT = 'DEPOSIT_MOVEMENT',
  RECON_BATCH = 'RECON_BATCH',
  PERIOD_LOCK = 'PERIOD_LOCK',
  BANK_RECEIPT = 'BANK_RECEIPT',
  BANK_PAYMENT = 'BANK_PAYMENT',
  DEPOSIT_ACCOUNT = 'DEPOSIT_ACCOUNT',
}

export enum DepositAuditAction {
  RECONCILE = 'RECONCILE',
  UNRECONCILE = 'UNRECONCILE',
  LOCK_PERIOD = 'LOCK_PERIOD',
  UNLOCK_PERIOD = 'UNLOCK_PERIOD',
  REVERSE = 'REVERSE',
  EDIT_OPENING_BALANCE = 'EDIT_OPENING_BALANCE',
  POS_LATE_LOCKED = 'POS_LATE_LOCKED',
}

/**
 * Append-only audit trail for the whole deposit-fund reconcile/lock module
 * (NFR-05, TKT-DFR-01/06). No `updated_at`/`deleted_at` — rows are immutable.
 * DFR-02/DFR-05 insert directly via this entity ahead of DFR-06 introducing
 * the full `DepositAuditService` wrapper + `GET /deposit-audit-log` endpoint.
 */
@Entity('deposit_audit_log')
@Index('idx_deposit_audit_entity', ['organizationId', 'entityType', 'entityId'])
@Index('idx_deposit_audit_time', ['organizationId', 'createdAt'])
export class DepositAuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'varchar' })
  organizationId: string;

  @Column({ name: 'branch_id', type: 'varchar', nullable: true })
  branchId?: string | null;

  @Column({ name: 'entity_type', type: 'varchar' })
  entityType: DepositAuditEntityType;

  @Column({ name: 'entity_id', type: 'uuid' })
  entityId: string;

  @Column({ type: 'varchar' })
  action: DepositAuditAction;

  @Column({ type: 'jsonb', nullable: true })
  before?: unknown;

  @Column({ type: 'jsonb', nullable: true })
  after?: unknown;

  @Column({ name: 'actor_id', type: 'varchar' })
  actorId: string;

  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
