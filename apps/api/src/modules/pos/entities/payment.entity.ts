import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { PaymentMethod } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { SaleEntity } from './sale.entity';

@Entity('pos_payments')
@Index(['saleId'])
export class PaymentEntity extends BaseEntity {
  @Column({ name: 'sale_id', type: 'uuid' })
  saleId: string;

  @ManyToOne(() => SaleEntity, (sale) => sale.payments)
  @JoinColumn({ name: 'sale_id' })
  sale: SaleEntity;

  @Column({ type: 'enum', enum: PaymentMethod })
  method: PaymentMethod;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reference?: string;
}
