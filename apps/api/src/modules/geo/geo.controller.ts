import { Controller, Get, Param, Query, Version } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import {
  ProvinceDto,
  ProvinceListQueryDto,
  ProvinceListResponseDto,
} from './dto/province.dto';
import {
  WardDto,
  WardFindQueryDto,
  WardSearchQueryDto,
  WardSearchResponseDto,
} from './dto/ward.dto';
import { GeoService } from './geo.service';

/**
 * Tra cứu tỉnh/thành và phường/xã — dữ liệu tham chiếu công khai, không thuộc
 * tổ chức nào. Chỉ có `AuthGuard` toàn cục (JWT hoặc `X-Api-Key`); không
 * `PermissionGuard`, không `@RequirePermission`, không `@Actor()`, không cần
 * `X-Branch-Id`. Không bao giờ `@Public()` (ADR-03).
 *
 * Thứ tự route: tĩnh trước động trong cùng resource (`provinces` trước
 * `provinces/:code`, `wards` trước `wards/:code`) — Express 5 khớp theo thứ tự
 * đăng ký.
 */
@ApiTags('Geo')
@ApiBearerAuth('access-token')
@ApiSecurity('api-key')
@Controller('geo')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Get('provinces')
  @Version('2')
  @ApiOperation({
    summary: 'Danh sách tỉnh/thành hiện hành, tìm theo tên không dấu',
  })
  @ApiOkResponse({ type: ProvinceListResponseDto })
  async listProvinces(
    @Query() query: ProvinceListQueryDto,
  ): Promise<ProvinceListResponseDto> {
    return { data: await this.geo.listProvinces(query.q) };
  }

  @Get('provinces/:code')
  @Version('2')
  @ApiOperation({ summary: 'Một tỉnh/thành theo mã' })
  @ApiParam({
    name: 'code',
    description: 'Mã tỉnh hiện hành (2026_xx). Mã cũ (1995_xx) chỉ nằm trong mergedFrom → 404',
  })
  @ApiOkResponse({ type: ProvinceDto })
  @ApiNotFoundResponse({ description: 'Không có tỉnh/thành với mã này' })
  findProvince(@Param('code') code: string): Promise<ProvinceDto> {
    return this.geo.findProvince(code);
  }

  @Get('wards')
  @Version('2')
  @ApiOperation({
    summary: 'Tìm phường/xã theo tên không dấu, lọc theo tỉnh, phân trang',
    description:
      'Mặc định chỉ trả phường hiện hành. `includeLegacy=true` thêm phường cũ; ' +
      '`provinceCode=1995_xx` trả phường cũ của tỉnh đó. Sắp theo tên không dấu, rồi mã tỉnh, rồi mã phường.',
  })
  @ApiOkResponse({ type: WardSearchResponseDto })
  searchWards(@Query() query: WardSearchQueryDto): Promise<WardSearchResponseDto> {
    return this.geo.searchWards(query);
  }

  @Get('wards/:code')
  @Version('2')
  @ApiOperation({ summary: 'Một phường/xã theo mã' })
  @ApiParam({
    name: 'code',
    description: 'Mã phường. Không kèm provinceCode → tra bộ hiện hành; kèm 1995_xx → phường cũ',
  })
  @ApiOkResponse({ type: WardDto })
  @ApiNotFoundResponse({ description: 'Không có phường/xã với mã này (trong thời kỳ đã chọn)' })
  findWard(
    @Param('code') code: string,
    @Query() query: WardFindQueryDto,
  ): Promise<WardDto> {
    return this.geo.findWard(code, query.provinceCode);
  }
}
