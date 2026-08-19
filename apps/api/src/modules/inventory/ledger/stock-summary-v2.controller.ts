import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
  Version,
} from "@nestjs/common";
import { Response } from "express";
import { QueryBus } from "@nestjs/cqrs";
import {
  Actor,
  ActorContext,
} from "../../../common/decorators/actor-context.decorator";
import { RequireBranchScope, RequirePermission } from "../../auth/decorators";
import { PermissionGuard } from "../../rbac/permission.guard";
import { BranchScopeGuard } from "../../rbac/branch-scope.guard";
import {
  StockSummaryExportDto,
  StockSummarySearchV2Dto,
} from "./dto/stock-summary-search-v2.dto";
import { StockLedgerCardDto } from "./dto/stock-ledger-card.dto";
import { StockSkuBreakdownDto } from "./dto/stock-sku-breakdown.dto";
import { SearchStockSummaryV2Query } from "./queries/search-stock-summary-v2.query";
import { GetSkuBreakdownQuery } from "./queries/get-sku-breakdown.query";
import { GetStockLedgerCardQuery } from "./queries/get-stock-ledger-card.query";
import { StockSummaryExportService } from "./stock-summary-export.service";

@Controller("inventory/stock/summary")
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class StockSummaryV2Controller {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly exportService: StockSummaryExportService,
  ) {}

  @Post("search")
  @Version("2")
  @RequirePermission("inventory.read")
  search(@Body() dto: StockSummarySearchV2Dto, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new SearchStockSummaryV2Query(dto, actor));
  }

  /** "Chi tiết hàng hóa" — the variants behind one SKU row, by location. */
  @Post("sku-breakdown")
  @Version("2")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("inventory.read")
  skuBreakdown(
    @Body() dto: StockSkuBreakdownDto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new GetSkuBreakdownQuery(dto, actor));
  }

  /** "Chi tiết tồn kho" — the stock card of one variant in one storage. */
  @Post("ledger-card")
  @Version("2")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("inventory.read")
  ledgerCard(@Body() dto: StockLedgerCardDto, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new GetStockLedgerCardQuery(dto, actor));
  }

  @Post("export")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("inventory.read")
  async export(
    @Body() dto: StockSummaryExportDto,
    @Actor() actor: ActorContext,
    @Res() res: Response,
  ) {
    const buffer = await this.exportService.exportBuffer(dto, actor);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="tong-hop-ton-kho.xlsx"',
    );
    res.send(buffer);
  }
}
