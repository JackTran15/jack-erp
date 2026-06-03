import { Entity, Column, OneToMany, Index } from 'typeorm';
import { PurchaseOrderStatus } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { PurchaseOrderLineEntity } from './purchase-order-line.entity';

/** Phiếu đặt hàng — purchase order from supplier. Workflow: DRAFT → APPROVED → RECEIVING → RECEIVED | CANCELLED */
@Entity('purchase_orders')
@Index(['organizationId', 'status'])
@Index('IDX_purchase_orders_org_branch_list', ['organizationId', 'branchId', 'status', 'createdAt'])
export class PurchaseOrderEntity extends BaseEntity {
  @Column({ name: 'document_number', nullable: true, unique: true, comment: 'Auto-generated on approval' })
  documentNumber?: string;

  @Column({ name: 'provider_id', type: 'uuid', comment: 'Supplier (inventory_providers)' })
  providerId: string;

  @Column({ name: 'location_id', type: 'uuid', comment: 'Destination storage location for received goods' })
  locationId: string;

  @Column({ type: 'enum', enum: PurchaseOrderStatus, default: PurchaseOrderStatus.DRAFT })
  status: PurchaseOrderStatus;

  @Column({ name: 'expected_date', type: 'date', nullable: true, comment: 'Expected delivery date' })
  expectedDate?: string;

  @Column({ nullable: true, comment: 'Free-text notes' })
  notes?: string;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy?: string;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt?: Date;

  @OneToMany(() => PurchaseOrderLineEntity, (line) => line.purchaseOrder, {
    cascade: ['insert'],
    eager: true,
  })
  lines: PurchaseOrderLineEntity[];
}
