import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

/**
 * A named API key a third-party integration uses to authenticate instead of
 * a user JWT (see `AuthGuard`). The raw secret is never stored — only its
 * hash (`keyHash`) plus a short `keyPrefix` safe to show in the admin list.
 *
 * `userId` (ADR-04, `.ai/features/api-key-auth/03-logical-design.md`) points
 * at a real, never-loginable "shadow user" row created alongside the key.
 * `PermissionGuard`/`RbacService` resolve permissions purely from a DB
 * `user_roles` lookup keyed on `userId` — they never read `roles` off the
 * request — so this is the only way an API-key request passes any
 * permission check. `roles` here lists the role ids granted, but only to
 * populate that shadow user's `user_roles`; it is not read at request time.
 *
 * `branchIds` mirrors what a JWT payload carries (see `ActorContext`); NULL
 * means the key is not restricted to a subset of the organization's
 * branches. `ipWhitelist` holds IPv4 addresses and/or CIDR ranges — a
 * request presenting this key from any other IP is rejected regardless of
 * the key being otherwise valid.
 *
 * Columns are declared explicitly instead of extending `BaseEntity`, matching
 * `PaymentAccountEntity` — this table's array/jsonb columns aren't part of
 * the shared base shape.
 */
@Entity('api_keys')
@Index('IDX_api_keys_organization', ['organizationId'])
export class ApiKeyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'varchar' })
  organizationId: string;

  /** Shadow user (see class doc) that actually carries this key's permissions. */
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  /** First characters of the raw key — safe to display, not a secret. */
  @Column({ name: 'key_prefix', type: 'varchar', length: 16 })
  keyPrefix: string;

  /** SHA-256 hex digest of the raw key. Never the plaintext value. */
  @Column({ name: 'key_hash', type: 'varchar', length: 64, unique: true })
  keyHash: string;

  /** Role ids (roles.id) granted — used only to populate the shadow user's user_roles. */
  @Column({ type: 'text', array: true, default: '{}' })
  roles: string[];

  /** NULL = not restricted to a subset of the organization's branches. */
  @Column({ name: 'branch_ids', type: 'text', array: true, nullable: true })
  branchIds?: string[];

  /** IPv4 addresses and/or CIDR ranges allowed to present this key. */
  @Column({ name: 'ip_whitelist', type: 'jsonb', default: () => "'[]'" })
  ipWhitelist: string[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;

  @Column({ name: 'created_by', type: 'varchar' })
  createdBy: string;
}
