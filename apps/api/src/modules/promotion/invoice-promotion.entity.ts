import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity';

export enum InvoicePromotionType {
  DISCOUNT_CODE = 'discount_code',
  VOUCHER = 'voucher',
  PROMOTION = 'promotion',
}

@Entity('invoice_promotions')
@Index(['invoiceId'])
export class InvoicePromotionEntity extends BaseEntity {
  @Column({ type: 'uuid', nullable: false, name: 'invoice_id' })
  invoiceId: string;

  @Column({ type: 'enum', enum: InvoicePromotionType, nullable: false, name: 'promotion_type' })
  promotionType: InvoicePromotionType;

  @Column({ type: 'uuid', nullable: false, name: 'ref_id' })
  refId: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, name: 'discount_amount' })
  discountAmount: number;

  @Column({ type: 'text', nullable: true })
  note?: string;
}
