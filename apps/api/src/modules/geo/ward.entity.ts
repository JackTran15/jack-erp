import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Phường/xã, cả hai thời kỳ. `province_code` là `2026_xx` (hiện hành, không còn
 * cấp huyện → `district_code` NULL) hoặc `1995_xx` (cũ, có `district_code`).
 * Không FK sang `geo_provinces`: mã `1995_xx` không có dòng tỉnh. `is_current`
 * được loader tính lại = `province_code` có trong `geo_provinces`, không suy từ
 * tiền tố năm. Mã phường chỉ duy nhất theo `(province_code, code)`.
 */
@Entity('geo_wards')
@Index('UQ_geo_wards_province_code_code', ['provinceCode', 'code'], { unique: true })
@Index('IDX_geo_wards_is_current', ['isCurrent'])
@Index('IDX_geo_wards_province_code', ['provinceCode'])
export class WardEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 8 })
  code: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ name: 'province_code', type: 'varchar', length: 16 })
  provinceCode: string;

  @Column({ name: 'district_code', type: 'varchar', length: 8, nullable: true })
  districtCode: string | null;

  @Column({ name: 'is_current', type: 'boolean', default: false })
  isCurrent: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
