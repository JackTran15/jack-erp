import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

export enum CashAccountType {
  REGISTER = 'REGISTER',     // Két quầy POS, gắn với terminal
  SAFE = 'SAFE',             // Két chính chi nhánh
  PETTY_CASH = 'PETTY_CASH', // Quỹ lẻ chi phí vặt
}

/** Physical or logical cash drawer/register/petty cash fund at a branch. Linked to a COA account. */
@Entity('cash_accounts')
@Index('idx_cash_account_org_branch', ['organizationId', 'branchId'])
@Index('idx_cash_account_ledger', ['accountId'])
export class CashAccountEntity extends BaseEntity {
  @Column({ length: 200, comment: 'Display name (e.g. Register 1, Petty Cash)' })
  name: string;

  @Column({
    type: 'enum',
    enum: CashAccountType,
    default: CashAccountType.REGISTER,
    comment: 'REGISTER=két quầy POS, SAFE=két chính chi nhánh, PETTY_CASH=quỹ lẻ',
  })
  type: CashAccountType;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    comment: 'Current cash balance; updated in real-time with each movement',
  })
  balance: number;

  @Column({ name: 'account_id', type: 'uuid', comment: 'Corresponding general ledger account in the COA' })
  accountId: string;
}
