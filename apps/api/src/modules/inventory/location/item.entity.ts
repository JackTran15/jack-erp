import { Entity, Column, Unique } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

@Entity('items')
@Unique(['organizationId', 'code'])
export class ItemEntity extends BaseEntity {
  @Column()
  code: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description?: string;

  @Column()
  unit: string;

  @Column({ nullable: true })
  category?: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
