import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import {
  MobileInventoryCategoryResponseDto,
  MobileInventoryUnitResponseDto,
} from '../dto/mobile-inventory-catalog.response.dto';
import {
  MobileInventoryFlowResponseDto,
  MobileInventoryVariantResponseDto,
  MobileInventoryVoucherPageDto,
} from '../dto/mobile-inventory-drilldown.response.dto';
import { MobileInventoryFlowQueryDto } from '../dto/mobile-inventory-flow.query.dto';
import {
  MobileInventoryKind,
  MobileInventoryLevel,
  MobileInventoryProductListQueryDto,
  MobileInventorySort,
  MobileInventoryStatus,
} from '../dto/mobile-inventory-product-list.query.dto';
import { MobileInventoryStoreListQueryDto } from '../dto/mobile-inventory-store-list.query.dto';
import {
  MobileInventoryVoucherListQueryDto,
  MobileInventoryVoucherSort,
} from '../dto/mobile-inventory-voucher-list.query.dto';
import {
  MobileInventoryProductPageDto,
  MobileInventoryStoreResponseDto,
} from '../dto/mobile-inventory.response.dto';
import { MobileInventoryCatalogService } from '../services/mobile-inventory-catalog.service';
import { MobileInventoryDrilldownService } from '../services/mobile-inventory-drilldown.service';
import { MobileInventoryService } from '../services/mobile-inventory.service';

/**
 * Báo cáo tồn kho cho app mobile — màn "Tồn kho" nhìn theo mặt hàng, theo
 * cửa hàng, màn chi tiết một cửa hàng, và chuỗi drill-down (biến thể → cửa
 * hàng đang giữ → luồng nhập/xuất + phiếu). CHỈ đọc.
 *
 * Các đường `products/:id/...` nhận `:id` HỖN HỢP (mẫu mã hoặc item) — lý do
 * ở `MobileInventoryDrilldownService`. Thứ tự khai route có nghĩa: `stores`
 * phải đứng TRƯỚC `stores/:branchId`, và `products` trước `products/:id/*`,
 * không thì Nest khớp nhầm đoạn tĩnh vào tham số.
 *
 * `GET` với query phẳng, không phải `POST` với body lồng như
 * `/v2/inventory/stock/summary/search` của web — cùng lý do đã ghi ở
 * `MobileStockDocumentController`: mọi đường `/mobile/**` đều là `GET`.
 *
 * KHÔNG có `BranchScopeGuard`: chi nhánh đi qua query `branchIds`, vắng = mọi
 * chi nhánh người dùng được phép. Header `X-Branch-Id` không dùng được cho
 * việc này — lý do ở `MobileInventoryService`.
 *
 * Quyền `inventory.read` — cùng quyền mà nhà cung cấp/hàng hoá mobile đang
 * dùng; web gác tổng hợp tồn kho bằng đúng quyền này
 * (`StockSummaryV2Controller`).
 */
@ApiTags('mobile')
@Controller('mobile/inventory')
@UseGuards(PermissionGuard)
export class MobileInventoryController {
  constructor(
    private readonly inventory: MobileInventoryService,
    private readonly drilldown: MobileInventoryDrilldownService,
    private readonly catalog: MobileInventoryCatalogService,
  ) {}

  @Get('categories')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'Nhóm hàng đang hoạt động — danh sách phẳng kèm parentId' })
  @ApiOkResponse({ type: [MobileInventoryCategoryResponseDto] })
  listCategories(
    @Actor() actor: ActorContext,
  ): Promise<MobileInventoryCategoryResponseDto[]> {
    return this.catalog.listCategories(actor);
  }

  @Get('units')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'Đơn vị tính đang có trên hàng hoá, gộp không phân biệt hoa/thường' })
  @ApiOkResponse({ type: [MobileInventoryUnitResponseDto] })
  listUnits(@Actor() actor: ActorContext): Promise<MobileInventoryUnitResponseDto[]> {
    return this.catalog.listUnits(actor);
  }

  @Get('products')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'Tồn kho theo mặt hàng, phân trang, kèm tổng toàn tập' })
  listProducts(
    @Query() query: MobileInventoryProductListQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileInventoryProductPageDto> {
    return this.inventory.listProducts(toProductQuery(query), actor);
  }

  @Get('stores')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'Thẻ tồn kho của từng cửa hàng người dùng được phép' })
  @ApiOkResponse({ type: [MobileInventoryStoreResponseDto] })
  listStores(
    @Query() query: MobileInventoryStoreListQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileInventoryStoreResponseDto[]> {
    return this.inventory.listStores(toStoreQuery(query), actor);
  }

  /** `ParseUUIDPipe` — cùng lý do mọi `:id` mobile: 400 thay vì 500 cho id rác. */
  @Get('stores/:branchId')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'Thẻ tồn kho của một cửa hàng' })
  findStore(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() query: MobileInventoryFlowQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileInventoryStoreResponseDto> {
    return this.inventory.findStore(branchId, toFlowQuery(query), actor);
  }

  @Get('products/:id/variants')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'Biến thể của một mặt hàng trong kỳ, kèm tồn đầu/cuối và nhập/xuất' })
  @ApiOkResponse({ type: [MobileInventoryVariantResponseDto] })
  listVariants(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MobileInventoryStoreListQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileInventoryVariantResponseDto[]> {
    return this.drilldown.listVariants(id, toStoreQuery(query), actor);
  }

  @Get('products/:id/stores')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'Cửa hàng đang giữ một mặt hàng — thẻ thu hẹp về mặt hàng đó' })
  @ApiOkResponse({ type: [MobileInventoryStoreResponseDto] })
  listStoresOf(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MobileInventoryStoreListQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileInventoryStoreResponseDto[]> {
    return this.drilldown.listStoresOf(id, toStoreQuery(query), actor);
  }

  @Get('products/:id/stores/:branchId')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'Luồng nhập/xuất của một mặt hàng tại một cửa hàng trong kỳ' })
  getFlow(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() query: MobileInventoryFlowQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileInventoryFlowResponseDto> {
    return this.drilldown.getFlow({ id, branchId }, toFlowQuery(query), actor);
  }

  @Get('products/:id/stores/:branchId/vouchers')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'Phiếu của một mặt hàng tại một cửa hàng trong kỳ, phân trang' })
  listVouchers(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() query: MobileInventoryVoucherListQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileInventoryVoucherPageDto> {
    return this.drilldown.listVouchers(
      { id, branchId },
      toVoucherQuery(query),
      actor,
    );
  }
}

/** Điền mặc định cho DTO — service nhận giá trị đã chắc chắn có. */
function toProductQuery(query: MobileInventoryProductListQueryDto) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 20,
    search: query.search,
    branchIds: query.branchIds,
    asOf: query.asOf,
    kind: query.kind ?? MobileInventoryKind.ON_HAND,
    status: query.status ?? MobileInventoryStatus.ALL,
    sort: query.sort ?? MobileInventorySort.QUANTITY_DESC,
    level: query.level ?? MobileInventoryLevel.PRODUCT,
    unit: query.unit,
    categoryId: query.categoryId,
  };
}

function toStoreQuery(query: MobileInventoryStoreListQueryDto) {
  return {
    asOf: query.asOf,
    kind: query.kind ?? MobileInventoryKind.ON_HAND,
    branchIds: query.branchIds,
  };
}

function toFlowQuery(query: MobileInventoryFlowQueryDto) {
  return {
    asOf: query.asOf,
    kind: query.kind ?? MobileInventoryKind.ON_HAND,
  };
}

function toVoucherQuery(query: MobileInventoryVoucherListQueryDto) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 20,
    asOf: query.asOf,
    kind: query.kind ?? MobileInventoryKind.ON_HAND,
    search: query.search,
    storageId: query.storageId,
    sort: query.sort ?? MobileInventoryVoucherSort.DATE,
  };
}
