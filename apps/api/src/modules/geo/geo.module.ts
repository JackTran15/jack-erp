import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';
import { ProvinceEntity } from './province.entity';
import { WardEntity } from './ward.entity';

/**
 * Tỉnh/thành và phường/xã — bảng toàn cục nạp bằng migration
 * (`LoadGeoDataset*` qua `upsertGeoDataset()`), đọc qua `/v2/geo/*`.
 * Không đăng ký vào generic CRUD platform: `applyScoping` luôn AND
 * `organizationId`, còn bảng này không có cột đó.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ProvinceEntity, WardEntity])],
  controllers: [GeoController],
  providers: [GeoService],
})
export class GeoModule {}
