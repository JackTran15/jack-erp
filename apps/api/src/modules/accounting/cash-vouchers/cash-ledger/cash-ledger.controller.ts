import {
  Controller,
  Get,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  Actor,
  ActorContext,
} from '../../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../../auth/decorators';
import { PermissionGuard } from '../../../rbac/permission.guard';
import { BranchScopeGuard } from '../../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../../crud/audit.interceptor';
import { CashLedgerService } from './cash-ledger.service';
import { QueryCashLedgerDto } from './dto/query-cash-ledger.dto';

@Controller('cash-ledger')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class CashLedgerController {
  constructor(private readonly service: CashLedgerService) {}

  @Get()
  @RequirePermission('accounting.cash_ledger.read')
  getLedger(@Query() query: QueryCashLedgerDto, @Actor() actor: ActorContext) {
    return this.service.getLedger(query, actor);
  }
}
