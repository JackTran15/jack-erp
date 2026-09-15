import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../../common/utils/numeric.transformer';

export enum MediaOwnerType {
  PRODUCT = 'PRODUCT',
  ITEM = 'ITEM',
  EMPLOYEE_PROFILE = 'EMPLOYEE_PROFILE',
  GOODS_RECEIPT = 'GOODS_RECEIPT',
  TRANSFER_ORDER = 'TRANSFER_ORDER',
  STOCK_TRANSFER = 'STOCK_TRANSFER',
  CASH_RECEIPT = 'CASH_RECEIPT',
  CASH_PAYMENT = 'CASH_PAYMENT',
  BANK_RECEIPT = 'BANK_RECEIPT',
  BANK_PAYMENT = 'BANK_PAYMENT',
}

export enum MediaStatus {
  PENDING = 'PENDING',
  UPLOADED = 'UPLOADED',
  ATTACHED = 'ATTACHED',
  DELETED = 'DELETED',
}

/**
 * Source of truth for every uploaded file (ADR-03, 03-logical-design.md).
 * Not a `SoftDeleteEntity`: `DELETED` is a state in the upload/attach/detach
 * machine that `MediaCleanupJob` still needs to query, not a soft-delete
 * marker that should be hidden from normal reads.
 */
@Entity('media_objects')
@Index('IDX_media_objects_owner_attached', ['organizationId', 'ownerType', 'ownerId', 'sortOrder'], {
  where: `"status" = 'ATTACHED'`,
})
@Index('IDX_media_objects_cleanup', ['status', 'createdAt'])
export class MediaObjectEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'owner_type', type: 'varchar', length: 40 })
  ownerType: MediaOwnerType;

  /** Null while PENDING / UPLOADED. */
  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  ownerId: string | null;

  @Column({ name: 'status', type: 'varchar', length: 20 })
  status: MediaStatus;

  /** Derived from the owner policy at upload time; kept so the cleanup job does not depend on the constant. */
  @Column({ name: 'bucket', type: 'varchar', length: 63 })
  bucket: string;

  /** `org/<organizationId>/<owner_type lowercased>/<id>` (ADR-04). */
  @Column({ name: 'object_key', type: 'varchar', length: 300, unique: true })
  objectKey: string;

  /** Original file name; display and Content-Disposition only, never part of the key. */
  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName: string;

  @Column({ name: 'content_type', type: 'varchar', length: 100 })
  contentType: string;

  /**
   * node-postgres returns `bigint` as a string; convert so size checks compare
   * numbers. Sizes are capped at 10 MiB, far below Number.MAX_SAFE_INTEGER.
   */
  @Column({ name: 'size_bytes', type: 'bigint', transformer: numericTransformer })
  sizeBytes: number;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  /** Only the creator may complete and first attach this media. */
  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'attached_at', type: 'timestamptz', nullable: true })
  attachedAt: Date | null;

  /** When the row moved to DELETED. */
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  /** When the real object was removed from storage. */
  @Column({ name: 'object_removed_at', type: 'timestamptz', nullable: true })
  objectRemovedAt: Date | null;
}
