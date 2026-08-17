import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../../database/entities/base.entity';

@Entity('promotion_groups')
@Index('uq_promotion_group_program_ordinal', ['programId', 'ordinal'], { unique: true })
export class PromotionGroupEntity extends BaseEntity {
  @Column({ name: 'program_id', type: 'uuid' })
  programId: string;

  @Column({ type: 'int' })
  ordinal: number;

  @Column({ type: 'varchar', nullable: true })
  name?: string;
}
