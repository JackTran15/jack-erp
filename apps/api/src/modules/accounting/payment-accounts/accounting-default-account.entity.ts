import { Entity, Column, DeleteDateColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { AccountingDefaultAccountRole } from './enums';

/**
 * Default COA account per role (REVENUE/RECEIVABLE), resolved server-side at
 * checkout. `branch_id` NULL = org-wide default; a set branch_id overrides it
 * for that branch. Resolution: branch override → org default → throw.
 */
@Entity('accounting_default_account')
export class AccountingDefaultAccountEntity extends BaseEntity {
  @Column({
    name: 'account_role',
    type: 'enum',
    enum: AccountingDefaultAccountRole,
    enumName: 'accounting_default_account_role_enum',
  })
  accountRole: AccountingDefaultAccountRole;

  @Column({ name: 'account_id', type: 'uuid', comment: 'Default COA account (accounts.id) for this role' })
  accountId: string;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
