import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { AccountType } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';

/** Node in the Chart of Accounts tree. Categorized by type (Asset, Liability, Equity, Revenue, Expense). */
@Entity('accounts')
@Index('uq_account_org_code', ['organizationId', 'code'], { unique: true })
@Index('idx_account_org_type', ['organizationId', 'type'])
@Index('idx_account_parent', ['parentAccountId'])
export class AccountEntity extends BaseEntity {
  @Column({ length: 50, comment: 'Alphanumeric account code (e.g. 1010, 5200); unique per org' })
  code: string;

  @Column({ length: 200, comment: 'Account name (e.g. Cash on Hand, Cost of Goods Sold)' })
  name: string;

  @Column({ type: 'enum', enum: AccountType, comment: 'Fundamental accounting type (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE)' })
  type: AccountType;

  @Column({ name: 'parent_account_id', type: 'uuid', nullable: true, comment: 'FK to accounts — creates hierarchy (e.g. Cash under Current Assets)' })
  parentAccountId?: string;

  @ManyToOne(() => AccountEntity, { nullable: true })
  @JoinColumn({ name: 'parent_account_id' })
  parentAccount?: AccountEntity;

  @Column({ name: 'is_active', default: true, comment: 'Inactive accounts cannot be used in new journal entries' })
  isActive: boolean;
}
