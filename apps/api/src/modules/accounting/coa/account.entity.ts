import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { AccountType } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';

@Entity('accounts')
@Index('uq_account_org_code', ['organizationId', 'code'], { unique: true })
@Index('idx_account_org_type', ['organizationId', 'type'])
@Index('idx_account_parent', ['parentAccountId'])
export class AccountEntity extends BaseEntity {
  @Column({ length: 50 })
  code: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'enum', enum: AccountType })
  type: AccountType;

  @Column({ name: 'parent_account_id', type: 'uuid', nullable: true })
  parentAccountId?: string;

  @ManyToOne(() => AccountEntity, { nullable: true })
  @JoinColumn({ name: 'parent_account_id' })
  parentAccount?: AccountEntity;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
