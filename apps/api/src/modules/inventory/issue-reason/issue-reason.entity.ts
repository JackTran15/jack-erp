import { Entity, Column, Unique, Index } from 'typeorm';
import { IssueReasonPurpose } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';

/** Lý do xuất kho cho các phiếu xuất kho với purpose=OTHER hoặc DISPOSAL. */
@Entity('issue_reasons')
@Unique(['organizationId', 'code'])
@Index(['organizationId', 'purpose'])
export class IssueReasonEntity extends BaseEntity {
  @Column({ comment: 'Mã lý do duy nhất trong organization' })
  code: string;

  @Column({ comment: 'Tên hiển thị của lý do' })
  name: string;

  @Column({
    type: 'enum',
    enum: IssueReasonPurpose,
    comment: 'Lý do thuộc nhóm OTHER (xuất khác) hay DISPOSAL (hủy hàng)',
  })
  purpose: IssueReasonPurpose;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
