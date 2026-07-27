import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { VoucherLinkKind, VoucherLinkRelation } from './enums';

/**
 * A directed link between two vouchers that live in different tables (ADR-02).
 *
 * Deliberately polymorphic and without foreign keys: `fromKind` decides which
 * table `fromId` points at. The unique index on the whole tuple is what makes
 * writing a link idempotent under event replay.
 */
@Entity('voucher_links')
@Index('idx_voucher_links_from', ['organizationId', 'fromKind', 'fromId'])
@Index('idx_voucher_links_to', ['organizationId', 'toKind', 'toId'])
@Index('idx_voucher_links_invoice', ['organizationId', 'invoiceId'])
@Index(
  'uq_voucher_links_pair',
  ['organizationId', 'fromKind', 'fromId', 'toKind', 'toId', 'relation'],
  { unique: true },
)
export class VoucherLinkEntity extends BaseEntity {
  @Column({
    name: 'from_kind',
    type: 'enum',
    enum: VoucherLinkKind,
    enumName: 'voucher_link_kind_enum',
  })
  fromKind: VoucherLinkKind;

  @Column({ name: 'from_id', type: 'uuid' })
  fromId: string;

  @Column({
    name: 'to_kind',
    type: 'enum',
    enum: VoucherLinkKind,
    enumName: 'voucher_link_kind_enum',
  })
  toKind: VoucherLinkKind;

  @Column({ name: 'to_id', type: 'uuid' })
  toId: string;

  @Column({
    type: 'enum',
    enum: VoucherLinkRelation,
    enumName: 'voucher_link_relation_enum',
  })
  relation: VoucherLinkRelation;

  @Column({
    name: 'invoice_id',
    type: 'uuid',
    nullable: true,
    comment: 'Business document both vouchers belong to, when there is one',
  })
  invoiceId?: string;
}
