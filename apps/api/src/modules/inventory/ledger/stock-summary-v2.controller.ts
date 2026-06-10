import { Body, Controller, Post, UseGuards, Version } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import {
  Actor,
  ActorContext,
} from "../../../common/decorators/actor-context.decorator";
import { RequireBranchScope, RequirePermission } from "../../auth/decorators";
import { PermissionGuard } from "../../rbac/permission.guard";
import { BranchScopeGuard } from "../../rbac/branch-scope.guard";
import { StockSummarySearchV2Dto } from "./dto/stock-summary-search-v2.dto";
import { SearchStockSummaryV2Query } from "./queries/search-stock-summary-v2.query";

@Controller("inventory/stock/summary")
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class StockSummaryV2Controller {
  constructor(private readonly queryBus: QueryBus) {}

  @Post("search")
  @Version("2")
  @RequirePermission("inventory.read")
  search(@Body() dto: StockSummarySearchV2Dto, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new SearchStockSummaryV2Query(dto, actor));
  }
}
