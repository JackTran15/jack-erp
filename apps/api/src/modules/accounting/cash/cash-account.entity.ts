import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

@Entity('cash_accounts')
@Index('idx_cash_account_org_branch', ['organizationId', 'branchId'])
@Index('idx_cash_account_ledger', ['accountId'])
export class CashAccountEntity extends BaseEntity {
  @Column({ length: 200 })
  name: string;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
  })
  balance: number;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;
}
