import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { escapeLikeTerm } from '../../common/utils/like-escape.util';
import { ProvinceDto } from './dto/province.dto';
import { WardDto, WardSearchQueryDto, WardSearchResponseDto } from './dto/ward.dto';
import { ProvinceEntity } from './province.entity';
import { WardEntity } from './ward.entity';

/**
 * Đọc dữ liệu tỉnh/phường. Không scope theo tổ chức, không đọc ActorContext —
 * dữ liệu công khai, ranh giới là AuthGuard toàn cục (ADR-03).
 *
 * Tìm không dấu: `unaccent(lower(...))` ở cả cột lẫn tham số, cùng một hàm
 * Postgres nên hai vế không thể lệch nhau (ADR-02). `q` đi qua
 * `escapeLikeTerm` để % và _ là ký tự thường.
 */
@Injectable()
export class GeoService {
  constructor(
    @InjectRepository(ProvinceEntity)
    private readonly provinces: Repository<ProvinceEntity>,
    @InjectRepository(WardEntity)
    private readonly wards: Repository<WardEntity>,
  ) {}

  async listProvinces(q?: string): Promise<ProvinceDto[]> {
    const qb = this.provinces
      .createQueryBuilder('p')
      .orderBy('unaccent(lower(p.name))', 'ASC')
      .addOrderBy('p.code', 'ASC');
    const term = q?.trim();
    if (term) {
      qb.andWhere(
        "unaccent(lower(p.name)) LIKE '%' || unaccent(lower(:q)) || '%'",
        { q: escapeLikeTerm(term) },
      );
    }
    const rows = await qb.getMany();
    return rows.map(toProvinceDto);
  }

  async findProvince(code: string): Promise<ProvinceDto> {
    const row = await this.provinces.findOne({ where: { code } });
    if (!row) {
      throw new NotFoundException('Không tìm thấy tỉnh/thành');
    }
    return toProvinceDto(row);
  }

  async searchWards(dto: WardSearchQueryDto): Promise<WardSearchResponseDto> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const base = this.wards.createQueryBuilder('w');

    // provinceCode chỉ định thắng includeLegacy: thời kỳ đã nằm trong mã (ADR-04).
    if (dto.provinceCode) {
      base.andWhere('w.province_code = :provinceCode', { provinceCode: dto.provinceCode });
    } else if (!dto.includeLegacy) {
      base.andWhere('w.is_current = true');
    }
    const term = dto.q?.trim();
    if (term) {
      base.andWhere(
        "unaccent(lower(w.name)) LIKE '%' || unaccent(lower(:q)) || '%'",
        { q: escapeLikeTerm(term) },
      );
    }

    const [data, total] = await Promise.all([
      selectWardDto(base.clone())
        .orderBy('unaccent(lower(w.name))', 'ASC')
        .addOrderBy('w.province_code', 'ASC')
        .addOrderBy('w.code', 'ASC')
        .offset((page - 1) * limit)
        .limit(limit)
        .getRawMany<WardDto>(),
      base.clone().getCount(),
    ]);
    return { data, total, page, limit };
  }

  async findWard(code: string, provinceCode?: string): Promise<WardDto> {
    const qb = this.wards.createQueryBuilder('w').where('w.code = :code', { code });
    if (provinceCode) {
      qb.andWhere('w.province_code = :provinceCode', { provinceCode });
    } else {
      // Mã phường duy nhất trong bộ hiện hành (A-07, script chuyển đổi kiểm) → không mơ hồ;
      // ORDER BY + LIMIT 1 để một dump lỗi lọt qua vẫn cho kết quả xác định thay vì ngẫu nhiên.
      qb.andWhere('w.is_current = true');
    }
    const row = await selectWardDto(qb)
      .orderBy('w.province_code', 'ASC')
      .limit(1)
      .getRawOne<WardDto>();
    if (!row) {
      throw new NotFoundException('Không tìm thấy phường/xã');
    }
    return row;
  }
}

/** LEFT JOIN tỉnh để có `provinceName`; null cho phường cũ (mã 1995_xx không có dòng tỉnh). */
function selectWardDto(qb: SelectQueryBuilder<WardEntity>): SelectQueryBuilder<WardEntity> {
  return qb
    .leftJoin(ProvinceEntity, 'p', 'p.code = w.province_code')
    .select('w.code', 'code')
    .addSelect('w.name', 'name')
    .addSelect('w.province_code', 'provinceCode')
    .addSelect('p.name', 'provinceName')
    .addSelect('w.district_code', 'districtCode')
    .addSelect('w.is_current', 'isCurrent');
}

function toProvinceDto(p: ProvinceEntity): ProvinceDto {
  return {
    code: p.code,
    name: p.name,
    isActive: p.isActive,
    // Cột `date`: driver pg (không có type parser riêng trong data-source.ts)
    // trả chuỗi YYYY-MM-DD; không đi qua Date để khỏi lệch múi giờ.
    effectiveFrom: p.effectiveFrom,
    mergedFrom: p.mergedFrom ?? [],
  };
}
