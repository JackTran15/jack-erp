import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity';

@Entity('vouchers')
@Index('uq_voucher_org_code', ['organizationId', 'code'], { unique: true })
export class VoucherEntity extends BaseEntity {
  @Column({ type: 'varchar', nullable: false })
  code: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, name: 'face_value' })
  faceValue: number;

  @Column({ type: 'uuid', nullable: true, name: 'customer_id' })
  customerId?: string;

  @Column({ type: 'timestamptz', nullable: false, name: 'valid_from' })
  validFrom: Date;

  @Column({ type: 'timestamptz', nullable: false, name: 'valid_to' })
  validTo: Date;

  @Column({ type: 'boolean', default: false, name: 'is_used' })
  isUsed: boolean;

  @Column({ type: 'uuid', nullable: true, name: 'redeemed_invoice_id' })
  redeemedInvoiceId?: string;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean;
}
