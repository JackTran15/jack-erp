import { Entity, Column, Unique, Index, OneToMany } from "typeorm";
import { ImportDuplicateMode, ImportJobStatus } from "@erp/shared-interfaces";
import { BaseEntity } from "../../../database/entities/base.entity";
import { InventoryImportJobRowEntity } from "./inventory-import-job-row.entity";

export enum ImportJobType {
  ITEMS = "ITEMS",
  OPENING_BALANCES = "OPENING_BALANCES",
  ADJUSTMENTS = "ADJUSTMENTS",
  STOCK_TAKE = "STOCK_TAKE",
  LOCATIONS = "LOCATIONS",
  GOODS_RECEIPT = "GOODS_RECEIPT",
  GOODS_ISSUE = "GOODS_ISSUE",
  STOCK_TRANSFER = "STOCK_TRANSFER",
  TRANSFER_ORDER = "TRANSFER_ORDER",
  CUSTOMERS = "CUSTOMERS",
  CATEGORIES = "CATEGORIES",
}

/** Tracks a bulk CSV import operation for items, opening balances, or adjustments. Enforces idempotency. */
@Entity("inventory_import_jobs")
@Unique(["organizationId", "type", "idempotencyKey"])
@Index(["organizationId", "status"])
export class InventoryImportJobEntity extends BaseEntity {
  @Column({
    type: "enum",
    enum: ImportJobType,
    comment:
      "What type of data is being imported (ITEMS, OPENING_BALANCES, ADJUSTMENTS, STOCK_TAKE, LOCATIONS, GOODS_RECEIPT, GOODS_ISSUE, STOCK_TRANSFER, TRANSFER_ORDER, CUSTOMERS, CATEGORIES)",
  })
  type: ImportJobType;

  @Column({
    name: "reference_id",
    type: "uuid",
    nullable: true,
    comment:
      "Optional source record this job targets (e.g. stockTakeId for STOCK_TAKE imports)",
  })
  referenceId?: string | null;

  @Column({ name: "file_name", comment: "Original uploaded CSV file name" })
  fileName: string;

  @Column({
    name: "file_checksum",
    comment: "SHA-256 hash of the file content for integrity verification",
  })
  fileChecksum: string;

  @Column({
    name: "idempotency_key",
    comment: "Client-provided key to prevent duplicate submissions",
  })
  idempotencyKey: string;

  @Column({
    type: "enum",
    enum: ImportJobStatus,
    default: ImportJobStatus.VALIDATING,
    comment: "Current processing state",
  })
  status: ImportJobStatus;

  @Column({
    name: "total_rows",
    type: "int",
    default: 0,
    comment: "Total number of data rows in the CSV",
  })
  totalRows: number;

  @Column({
    name: "valid_rows",
    type: "int",
    default: 0,
    comment: "Count of rows that passed validation",
  })
  validRows: number;

  @Column({
    name: "error_rows",
    type: "int",
    default: 0,
    comment: "Count of rows that failed validation",
  })
  errorRows: number;

  @Column({
    name: "duplicate_mode",
    type: "enum",
    enum: ImportDuplicateMode,
    default: ImportDuplicateMode.UPDATE,
    comment: "UPDATE = upsert SKU; SKIP = reject duplicate SKU",
  })
  duplicateMode: ImportDuplicateMode;

  @OneToMany(() => InventoryImportJobRowEntity, (row) => row.job)
  rows?: InventoryImportJobRowEntity[];
}
