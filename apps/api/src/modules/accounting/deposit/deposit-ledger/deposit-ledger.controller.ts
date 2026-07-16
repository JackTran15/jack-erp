import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  Actor,
  ActorContext,
} from '../../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../../auth/decorators';
import { PermissionGuard } from '../../../rbac/permission.guard';
import { BranchScopeGuard } from '../../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../../crud/audit.interceptor';
import { DepositLedgerService } from './deposit-ledger.service';
import { DepositLedgerQueryDto } from './dto/deposit-ledger-query.dto';

@Controller('deposit-ledger')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class DepositLedgerController {
  constructor(private readonly service: DepositLedgerService) {}

  @Get()
  @RequirePermission('accounting.deposit_ledger.read')
  getLedger(
    @Query() query: DepositLedgerQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getLedger(query, actor);
  }

  @Get('export')
  @RequirePermission('accounting.deposit_ledger.read')
  async export(
    @Query() query: DepositLedgerQueryDto,
    @Actor() actor: ActorContext,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.service.exportExcel(query, actor);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="deposit-ledger.xlsx"',
    });
    res.send(buffer);
  }
}
