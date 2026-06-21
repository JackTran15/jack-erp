import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiExtraModels,
  ApiProperty,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequireBranchScope, RequirePermission } from '../../auth/decorators';
import { AuditInterceptor } from '../../crud/audit.interceptor';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { PermissionGuard } from '../../rbac/permission.guard';
import { StockByLocationQueryDto } from './dto/stock-by-location.query.dto';
import { StockByLocationResponseDto } from './dto/stock-by-location.response.dto';
import { ArrangeLocationDto } from './dto/arrange-location.dto';
import { PreferredShelfResponseDto } from './dto/preferred-shelf.response.dto';
import {
  BatchPreferredShelfRequestDto,
  BatchPreferredShelfResponseDto,
} from './dto/batch-preferred-shelf.dto';
import { InventoryLocationStockService } from './inventory-location-stock.service';

class AddItemToLocationDto {
  @IsUUID()
  itemId: string;
}

class BatchAssignItemRowDto {
  @ApiProperty()
  @IsUUID()
  itemId!: string;

  @ApiProperty()
  @IsUUID()
  locationId!: string;
}

export class BatchAssignItemsDto {
  @ApiProperty({ type: [BatchAssignItemRowDto] })
  @ValidateNested({ each: true })
  @Type(() => BatchAssignItemRowDto)
  @ArrayMinSize(1)
  rows!: BatchAssignItemRowDto[];
}

@ApiTags('inventory')
@ApiExtraModels(PreferredShelfResponseDto)
@Controller('inventory/locations')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
export class InventoryLocationStockController {
  constructor(private readonly service: InventoryLocationStockService) {}

  @Get('preferred-shelf')
  @RequirePermission('inventory.read')
  @RequireBranchScope()
  @ApiOperation({
    summary: 'Lấy vị trí lưu kho ưu tiên (preferred shelf) của hàng hóa',
  })
  @ApiResponse({
    status: 200,
    description: 'Vị trí ưu tiên hoặc null nếu chưa được cấu hình',
    schema: {
      nullable: true,
      allOf: [{ $ref: getSchemaPath(PreferredShelfResponseDto) }],
    },
  })
  getPreferredShelf(
    @Query('itemId', ParseUUIDPipe) itemId: string,
    @Query('storageId', ParseUUIDPipe) storageId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getPreferredShelf(itemId, storageId, actor);
  }

  @Post('preferred-shelf/batch')
  @HttpCode(200)
  @RequirePermission('inventory.read')
  @RequireBranchScope()
  @ApiOperation({
    summary:
      'Resolve preferred shelves for many (itemId, storageId) pairs in one request',
  })
  @ApiResponse({ status: 200, type: BatchPreferredShelfResponseDto })
  async batchPreferredShelf(
    @Body() dto: BatchPreferredShelfRequestDto,
    @Actor() actor: ActorContext,
  ): Promise<BatchPreferredShelfResponseDto> {
    const data = await this.service.getPreferredShelfBatch(dto.pairs, actor);
    return { data };
  }

  @Get(':locationId/stock-items')
  @RequirePermission('inventory.read')
  @RequireBranchScope()
  @ApiOperation({
    summary: 'List items + stock tại 1 location (kể cả stock âm)',
  })
  @ApiResponse({ status: 200, type: StockByLocationResponseDto })
  @ApiResponse({
    status: 404,
    description: 'Location không tồn tại hoặc không thuộc tổ chức',
  })
  @ApiResponse({
    status: 403,
    description: 'Thiếu permission inventory.read hoặc sai branch scope',
  })
  listStockByLocation(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Query() query: StockByLocationQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getStockByLocation(locationId, query, actor);
  }

  @Post(':locationId/stock-items')
  @RequirePermission('inventory.write')
  @RequireBranchScope()
  @ApiOperation({
    summary:
      'Bind hàng hóa vào vị trí (tạo stock_balance = 0 + PSL). Không ghi stock movement.',
  })
  @ApiResponse({ status: 201, description: 'Đã thêm hàng hóa vào vị trí' })
  addItemToLocation(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: AddItemToLocationDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.addItemToLocation(locationId, dto.itemId, actor);
  }

  @Post('stock-items/batch')
  @RequirePermission('inventory.write')
  @RequireBranchScope()
  @ApiOperation({
    summary:
      'Xếp vị trí hàng hoá theo lô — tạo stock_balance = 0 + PSL cho nhiều cặp (item, location) trong 1 transaction.',
  })
  @ApiResponse({ status: 201, description: 'Kết quả: { created, skipped }' })
  assignBatch(
    @Body() dto: BatchAssignItemsDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.assignBatch(dto, actor);
  }

  @Post('arrange')
  @RequirePermission('inventory.write')
  @RequireBranchScope()
  @ApiOperation({
    summary:
      'Xếp vị trí: chuyển số lượng hàng từ "Chưa xếp" của kho lên kệ thật + ghi vị trí ưu tiên (PSL).',
  })
  @ApiResponse({
    status: 201,
    description: 'Kết quả: { moved, transferId }',
  })
  arrange(@Body() dto: ArrangeLocationDto, @Actor() actor: ActorContext) {
    return this.service.arrange(dto, actor);
  }

  @Delete(':locationId/stock-items/:itemId')
  @HttpCode(204)
  @RequirePermission('inventory.write')
  @RequireBranchScope()
  @ApiOperation({
    summary: 'Bỏ hàng hóa khỏi vị trí (chỉ cho phép khi tồn = 0)',
  })
  async removeItemFromLocation(
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    await this.service.removeItemFromLocation(locationId, itemId, actor);
  }
}
