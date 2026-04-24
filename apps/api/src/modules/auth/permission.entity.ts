import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Atomic permission seeded at startup (e.g. inventory.item.create). Global, not org-scoped. */
@Entity('permissions')
export class PermissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true, comment: 'Machine-readable permission key following module.resource.action convention' })
  key: string;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: 'Human-readable explanation of what this permission allows' })
  description: string | null;

  @Column({ type: 'varchar', length: 100, comment: 'Logical module grouping for UI display (e.g. inventory, accounting, pos)' })
  module: string;
}
