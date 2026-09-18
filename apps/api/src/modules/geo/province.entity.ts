import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface ProvinceMergedFrom {
  /** Mã tỉnh thời kỳ trước (`1995_xx`) đã gộp vào tỉnh này. */
  code: string;
  name: string;
}

/**
 * Tỉnh/thành hiện hành (cấu trúc sau sáp nhập 2025). Bảng toàn cục — không
 * `organization_id`, không soft-delete: dữ liệu tham chiếu chỉ được thay bằng
 * migration dữ liệu (`LoadGeoDataset*`), không sửa qua API. Mẫu: `report_types`.
 * Chỉ chứa tỉnh hiện hành; mã cũ nằm trong `merged_from` để ánh xạ địa chỉ cũ.
 */
@Entity('geo_provinces')
@Index('UQ_geo_provinces_code', ['code'], { unique: true })
export class ProvinceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 16 })
  code: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /** `date` — driver pg trả chuỗi `YYYY-MM-DD`. */
  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'merged_from', type: 'jsonb', default: () => "'[]'" })
  mergedFrom: ProvinceMergedFrom[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
