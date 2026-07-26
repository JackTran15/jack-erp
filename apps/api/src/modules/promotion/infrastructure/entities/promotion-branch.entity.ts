import { Entity, PrimaryColumn, Column } from 'typeorm';

/** Join table — empty per program = whole chain (BR-005). Not a BaseEntity: composite PK, no timestamps. */
@Entity('promotion_branches')
export class PromotionBranchEntity {
  @PrimaryColumn({ name: 'program_id', type: 'uuid' })
  programId: string;

  @PrimaryColumn({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @Column({ name: 'organization_id', type: 'varchar' })
  organizationId: string;
}
