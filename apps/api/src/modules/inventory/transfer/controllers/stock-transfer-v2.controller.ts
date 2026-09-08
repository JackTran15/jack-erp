import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  Version,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOkResponse, ApiOperation, ApiProperty } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../../auth/decorators';
import { PermissionGuard } from '../../../rbac/permission.guard';
import { BranchScopeGuard } from '../../../rbac/branch-scope.guard';
import { StockTransferSearchV2Dto } from '../dto/stock-transfer-search-v2.dto';
import { SearchStockTransfersV2Query } from '../queries/search-stock-transfers-v2.query';
import { StockTransferLineSearchV2Dto } from '../dto/stock-transfer-line-search-v2.dto';
import { SearchStockTransferLinesV2Query } from '../queries/search-stock-transfer-lines-v2.query';

/** Item summary carried on a stock transfer line row. */
class StockTransferLineItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
}

/** Storage summary carried on a stock transfer line row (source or destination). */
class StockTransferLineStorageDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

/** Location summary carried on a stock transfer line row (source or destination). */
class StockTransferLineLocationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
}

/** One row of a stock transfer's line grid (ADR-04: pagination-only, no column filters). */
class StockTransferLineRowDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  lineNo!: number;

  @ApiProperty({ format: 'uuid' })
  itemId!: string;

  @ApiProperty({ type: StockTransferLineItemDto, nullable: true })
  item!: StockTransferLineItemDto | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  sourceStorageId!: string | null;

  @ApiProperty({ type: StockTransferLineStorageDto, nullable: true })
  sourceStorage!: StockTransferLineStorageDto | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  destinationStorageId!: string | null;

  @ApiProperty({ type: StockTransferLineStorageDto, nullable: true })
  destinationStorage!: StockTransferLineStorageDto | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  sourceLocationId!: string | null;

  @ApiProperty({ type: StockTransferLineLocationDto, nullable: true })
  sourceLocation!: StockTransferLineLocationDto | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  destinationLocationId!: string | null;

  @ApiProperty({ type: StockTransferLineLocationDto, nullable: true })
  destinationLocation!: StockTransferLineLocationDto | null;

  @ApiProperty({ description: 'Quantity to transfer (numeric string)' })
  quantity!: string;

  @ApiProperty({ type: String, nullable: true })
  unitPrice!: string | null;

  @ApiProperty({ type: String, nullable: true })
  lineValue!: string | null;

  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;
}

/** Paginated envelope returned by `POST :id/lines/search` (ADR-04). */
class StockTransferLineSearchV2ResponseDto {
  @ApiProperty({ type: [StockTransferLineRowDto] })
  data!: StockTransferLineRowDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;
}

/**
 * `POST /v2/inventory/stock/transfers/search` — server-side CQRS search for
 * the Chuyển kho list, and `.../:id/lines/search` for one transfer's line
 * grid (ADR-04).
 */
@Controller('inventory/stock/transfers')
@UseGuards(PermissionGuard, BranchScopeGuard)
export class StockTransferV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @Version('2')
  @RequirePermission('inventory.transfer.read')
  @RequireBranchScope()
  search(
    @Body() dto: StockTransferSearchV2Dto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new SearchStockTransfersV2Query(dto, actor));
  }

  /**
   * Paginated lines of one stock transfer (ADR-04). Permission matches
   * `GET /inventory/stock/transfers/:id` (`inventory.transfer.read`), not
   * branch-scoped — the handler resolves and 404s by `organizationId` only,
   * matching `StockTransferService.getById` exactly.
   */
  @Post(':id/lines/search')
  @Version('2')
  @RequirePermission('inventory.transfer.read')
  @ApiOperation({ summary: "Search one stock transfer's lines (v2)" })
  @ApiOkResponse({ type: StockTransferLineSearchV2ResponseDto })
  searchLines(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StockTransferLineSearchV2Dto,
    @Actor() actor: ActorContext,
  ): Promise<StockTransferLineSearchV2ResponseDto> {
    return this.queryBus.execute(
      new SearchStockTransferLinesV2Query(id, dto, actor),
    );
  }
}
