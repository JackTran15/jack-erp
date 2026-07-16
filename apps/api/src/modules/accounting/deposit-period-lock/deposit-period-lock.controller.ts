import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../crud/audit.interceptor';
import { DepositPeriodLockService } from './deposit-period-lock.service';
import { LockPeriodDto } from './dto/lock-period.dto';
import { UnlockPeriodDto } from './dto/unlock-period.dto';

@Controller('deposit-period-locks')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class DepositPeriodLockController {
  constructor(private readonly periodLock: DepositPeriodLockService) {}

  @Get()
  @RequirePermission('accounting.deposit_period.read')
  list(@Query('branchId') branchId: string | undefined, @Actor() actor: ActorContext) {
    return this.periodLock.list(branchId, actor);
  }

  @Post()
  @RequirePermission('accounting.deposit_period.lock')
  lock(@Body() dto: LockPeriodDto, @Actor() actor: ActorContext) {
    return this.periodLock.lock(dto, actor);
  }

  /** BR-PERM-03: Kế toán trưởng only. */
  @Post(':id/unlock')
  @RequirePermission('accounting.deposit_period.unlock')
  unlock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UnlockPeriodDto,
    @Actor() actor: ActorContext,
  ) {
    return this.periodLock.unlock(id, dto, actor);
  }
}
