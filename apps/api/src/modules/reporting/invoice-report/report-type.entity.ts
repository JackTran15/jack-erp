import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Report-type catalogue row, seeded at startup by ReportTypeSyncService.
 * Global (not org-scoped) — the fixed list of reports a user can pick from,
 * MISA-style. Each `key` maps to a code-side ReportDefinition that owns the
 * columns + aggregation; this table only holds the picker metadata (VI name,
 * ordering, active flag).
 */
@Entity('report_types')
export class ReportTypeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    length: 80,
    unique: true,
    comment: 'Report definition key (matches ReportDefinition.key)',
  })
  key: string;

  @Column({
    type: 'varchar',
    length: 120,
    comment: 'Vietnamese display name shown in the report picker',
  })
  name: string;

  @Column({
    name: 'sort_order',
    type: 'integer',
    default: 0,
    comment: 'Ascending order in the report picker',
  })
  sortOrder: number;

  @Column({
    name: 'is_active',
    type: 'boolean',
    default: true,
    comment: 'Whether this report type is visible/selectable',
  })
  isActive: boolean;
}
