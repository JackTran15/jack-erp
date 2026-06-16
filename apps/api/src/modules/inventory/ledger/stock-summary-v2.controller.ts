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
import { SearchStockSummaryV2Query } from "./queries/search-stock-summary-v2.query";
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
