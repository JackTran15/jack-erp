import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
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
import { FundSwapsService } from './fund-swaps.service';
import { CreateFundSwapDto } from './dto/create-fund-swap.dto';

@Controller('fund-swaps')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class FundSwapsController {
  constructor(private readonly fundSwaps: FundSwapsService) {}

  @Post()
  @RequirePermission('accounting.fund_swap.create')
  swap(@Body() dto: CreateFundSwapDto, @Actor() actor: ActorContext) {
    return this.fundSwaps.swap(dto, actor);
  }

  /** Sibling vouchers of a swap, so a leg can link to its counterpart. */
  @Get(':swapId/legs')
  @RequirePermission('accounting.fund_swap.read')
  legs(
    @Param('swapId', ParseUUIDPipe) swapId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.fundSwaps.legs(swapId, actor);
  }
}
