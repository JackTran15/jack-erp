import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
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
import { InventoryLocationStockService } from './inventory-location-stock.service';

@ApiTags('inventory')
@Controller('inventory/locations')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
export class InventoryLocationStockController {
  constructor(private readonly service: InventoryLocationStockService) {}

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
}
