import { Body, Controller, Post, UseGuards, Version } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  Actor,
  ActorContext,
} from '../../../../common/decorators/actor-context.decorator';
import {
  RequireBranchScope,
  RequirePermission,
} from '../../../auth/decorators';
import { BranchScopeGuard } from '../../../rbac/branch-scope.guard';
import { PermissionGuard } from '../../../rbac/permission.guard';
import { CashVoucherSearchDto } from './cash-voucher-search.dto';
import { SearchCashVouchersQuery } from './search-cash-vouchers.query';

@Controller('cash-vouchers')
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class CashVoucherSearchController {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('search')
  @Version('2')
  @RequirePermission('accounting.cash_ledger.read')
  search(@Body() dto: CashVoucherSearchDto, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new SearchCashVouchersQuery(dto, actor));
  }
}
