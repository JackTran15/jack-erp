import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BankPaymentEntity } from './bank-payment.entity';

/**
 * A single line of a deposit-fund payment voucher. branch_id is NOT NULL and
 * there is no deleted_at, so columns are declared explicitly (not BaseEntity).
 * amount is CHECK (> 0) in the DB.
 */
@Entity('bank_payment_lines')
@Index('IDX_bank_payment_lines_payment', ['bankPaymentId'])
export class BankPaymentLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'varchar' })
  organizationId: string;

  @Column({ name: 'branch_id', type: 'varchar' })
  branchId: string;

  @Column({ name: 'bank_payment_id', type: 'uuid' })
  bankPaymentId: string;

  @ManyToOne(() => BankPaymentEntity, (payment) => payment.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'bank_payment_id' })
  bankPayment: BankPaymentEntity;

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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'created_by', type: 'varchar' })
  createdBy: string;
}
