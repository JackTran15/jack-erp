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
import { RequireBranchScope, RequirePermission } from '../../../auth/decorators';
import { PermissionGuard } from '../../../rbac/permission.guard';
import { BranchScopeGuard } from '../../../rbac/branch-scope.guard';
import { StockTakeLineSearchV2Dto } from '../dto/stock-take-line-search-v2.dto';
import { SearchStockTakeLinesV2Query } from '../queries/search-stock-take-lines-v2.query';

/** Item summary carried on a stock take line row. */
class StockTakeLineItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  unit!: string;
}

/** Location summary carried on a stock take line row. */
class StockTakeLineLocationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
}

/** One row of a stock take's line grid (ADR-04: pagination-only, no column filters). */
class StockTakeLineRowDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  lineNo!: number;

  @ApiProperty({ format: 'uuid' })
  itemId!: string;

  @ApiProperty({ type: StockTakeLineItemDto, nullable: true })
  item!: StockTakeLineItemDto | null;

  @ApiProperty({ format: 'uuid' })
  locationId!: string;

  @ApiProperty({ type: StockTakeLineLocationDto, nullable: true })
  location!: StockTakeLineLocationDto | null;

  @ApiProperty({ description: 'Expected (system) quantity (numeric string)' })
  expectedQty!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Counted quantity (numeric string)' })
  countedQty!: string | null;

  @ApiProperty({ description: 'Expected (system) value (numeric string)' })
  expectedValue!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Counted value (numeric string)' })
  countedValue!: string | null;

  @ApiProperty({ type: String, nullable: true })
  note!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'Variance reason' })
  reason!: string | null;
}

/**
 * Footer totals over the WHOLE voucher (AC-27), not just the page(s) loaded
 * so far — computed by a separate aggregate query, not by summing `data`.
 * `countedTotal`/`varianceTotal` only fold in lines with a non-null
 * `countedQty`, mirroring the panel's own convention.
 */
class StockTakeLineTotalsDto {
  @ApiProperty({ type: Number })
  expectedTotal!: number;

  @ApiProperty({ type: Number })
  countedTotal!: number;

  @ApiProperty({ type: Number })
  varianceTotal!: number;
}

/** Paginated envelope returned by `POST :id/lines/search` (ADR-04). */
class StockTakeLineSearchV2ResponseDto {
  @ApiProperty({ type: [StockTakeLineRowDto] })
  data!: StockTakeLineRowDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty({ type: StockTakeLineTotalsDto })
  totals!: StockTakeLineTotalsDto;
}

/**
 * `.../:id/lines/search` for one stock take's line grid (ADR-04) — the stock
 * take twin of `StockTransferV2Controller`/`GoodsReceiptV2Controller`. This
 * module has no list search yet (out of scope here), only the line grid.
 */
@Controller('inventory/stock-takes')
@UseGuards(PermissionGuard, BranchScopeGuard)
export class StockTakeV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  /**
   * Permission and branch scope match `GET /inventory/stock-takes/:id`
   * exactly (`stock-take.controller.ts:367-375`) — the handler 404s by
   * organization AND branch when the actor carries one, same as that route.
   */
  @Post(':id/lines/search')
  @Version('2')
  @RequirePermission('inventory.read')
  @RequireBranchScope()
  @ApiOperation({ summary: "Search one stock take's lines (v2)" })
  @ApiOkResponse({ type: StockTakeLineSearchV2ResponseDto })
  searchLines(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StockTakeLineSearchV2Dto,
    @Actor() actor: ActorContext,
  ): Promise<StockTakeLineSearchV2ResponseDto> {
    return this.queryBus.execute(
      new SearchStockTakeLinesV2Query(id, dto, actor),
    );
  }
}
