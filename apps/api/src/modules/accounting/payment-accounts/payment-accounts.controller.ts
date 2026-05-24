import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { PaymentAccountsService } from './payment-accounts.service';
import { ListPaymentAccountsQueryDto } from './dto/list-payment-accounts.query.dto';

@ApiTags('payment-accounts')
@Controller('payment-accounts')
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class PaymentAccountsController {
  constructor(
    private readonly paymentAccountsService: PaymentAccountsService,
  ) {}

  /** List the active payment accounts for the actor's branch (POS checkout picker). */
  @Get()
  @RequirePermission('pos.invoice.read')
  @ApiOkResponse({ description: 'Active payment accounts for the current branch.' })
  list(
    @Query() query: ListPaymentAccountsQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.paymentAccountsService.list(actor, query.method);
  }
}
