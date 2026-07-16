import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../crud/audit.interceptor';
import { DepositReconService } from './deposit-recon.service';
import { ListReconDto } from './dto/list-recon.dto';
import { ReconcileDto } from './dto/reconcile.dto';
import { UnreconcileDto } from './dto/unreconcile.dto';

@Controller('deposit-recon')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class DepositReconController {
  constructor(private readonly recon: DepositReconService) {}

  @Get()
  @RequirePermission('accounting.deposit_recon.read')
  list(@Query() query: ListReconDto, @Actor() actor: ActorContext) {
    return this.recon.list(query, actor);
  }

  @Get('export')
  @RequirePermission('accounting.deposit_recon.export')
  async export(
    @Query() query: ListReconDto,
    @Actor() actor: ActorContext,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.recon.exportExcel(query, actor);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="deposit-recon.xlsx"',
    });
    res.send(buffer);
  }

  /** BR-PERM-02: reconcile requires its own permission, distinct from `bank_payment.create`. */
  @Post('reconcile')
  @RequirePermission('accounting.deposit_recon.reconcile')
  reconcile(@Body() dto: ReconcileDto, @Actor() actor: ActorContext) {
    return this.recon.reconcile(dto, actor);
  }

  /** BR-PERM-03: Kế toán trưởng only. */
  @Post('unreconcile')
  @RequirePermission('accounting.deposit_recon.unreconcile')
  unreconcile(@Body() dto: UnreconcileDto, @Actor() actor: ActorContext) {
    return this.recon.unreconcile(dto, actor);
  }
}
