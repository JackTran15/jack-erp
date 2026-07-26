import { Entity, PrimaryColumn, Column } from 'typeorm';

/** Join table — only rows present when apply_to = CUSTOMER_GROUP. Not a BaseEntity: composite PK, no timestamps. */
@Entity('promotion_customer_groups')
export class PromotionCustomerGroupEntity {
  @PrimaryColumn({ name: 'program_id', type: 'uuid' })
  programId: string;

  @PrimaryColumn({ name: 'customer_group_id', type: 'uuid' })
  customerGroupId: string;

  @Column({ name: 'organization_id', type: 'varchar' })
  organizationId: string;
}
