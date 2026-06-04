import { Entity, Column, Index } from "typeorm";
import { StockMovementType } from "@erp/shared-interfaces";
import { BaseEntity } from "../../../database/entities/base.entity";

/** Immutable audit log of every stock movement. Append-only; corrections are offsetting entries. */
@Entity('stock_ledger_entries')
@Index(['organizationId', 'itemId', 'locationId'])
@Index(['organizationId', 'branchId', 'createdAt'])
@Index('idx_stock_ledger_org_posted', ['organizationId', 'postedAt'])
export class StockLedgerEntryEntity extends BaseEntity {
  @Column({
    name: "item_id",
    type: "uuid",
    comment: "The item affected by this movement",
  })
  itemId: string;

  @Column({
    name: "location_id",
    type: "uuid",
    comment: "The location affected by this movement",
  })
  locationId: string;

  @Column({
    type: "enum",
    enum: StockMovementType,
    name: "movement_type",
    comment: "Categorizes the reason for the stock change",
  })
  movementType: StockMovementType;

  @Column({
    type: "numeric",
    comment: "Signed quantity: positive = stock in, negative = stock out",
  })
  quantity: number;

  @Column({
    name: "reference_type",
    comment: "Source document type (e.g. SALE, TRANSFER, ADJUSTMENT)",
  })
  referenceType: string;

  @Column({
    name: "reference_id",
    type: "uuid",
    comment: "UUID of the source document",
  })
  referenceId: string;

  @Column({ nullable: true, comment: "Optional human-readable note" })
  notes?: string;

  @Column({
    name: "posted_at",
    type: "timestamptz",
    comment: "When this movement was financially posted",
  })
  postedAt: Date;

  @Column({
    name: 'unit_cost',
    type: 'numeric',
    precision: 18,
    scale: 2,
    nullable: true,
    comment: 'Cost snapshot at posting time; positive for both in/out movements',
  })
  unitCost?: number;

  @Column({
    name: 'line_value',
    type: 'numeric',
    precision: 18,
    scale: 2,
    nullable: true,
    comment: 'Signed value = quantity * unit_cost; positive=in, negative=out',
  })
  lineValue?: number;
}
