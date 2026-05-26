import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../../database/entities/base.entity';
import { CashPaymentEntity } from './cash-payment.entity';

@Entity('cash_payment_lines')
@Index('IDX_cash_payment_lines_payment', ['cashPaymentId'])
export class CashPaymentLineEntity extends BaseEntity {
  @Column({ name: 'cash_payment_id', type: 'uuid' })
  cashPaymentId: string;

  @ManyToOne(() => CashPaymentEntity, (payment) => payment.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'cash_payment_id' })
  cashPayment: CashPaymentEntity;

  @Column({ name: 'line_order', type: 'int', default: 0 })
  lineOrder: number;

  @Column({ type: 'varchar', length: 500 })
  description: string;

  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId?: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  amount: number;

  @Column({ name: 'reference_note', type: 'varchar', length: 255, nullable: true })
  referenceNote?: string;
}
