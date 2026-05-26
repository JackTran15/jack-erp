import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import {
  Actor,
  ActorContext,
} from '../../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../../auth/decorators';
import { PermissionGuard } from '../../../rbac/permission.guard';
import { BranchScopeGuard } from '../../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../../crud/audit.interceptor';
import { PartnerLookupService } from './partner-lookup.service';

/**
 * "Tài khoản thu" picker for the cash-voucher transfer form: the bank/deposit
 * accounts money can be transferred into (e.g. cash → bank). Cash (111x) is
 * intentionally excluded — separate from POS GET /payment-accounts.
 */
@Controller('cash-vouchers/receiving-accounts')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class ReceivingAccountController {
  constructor(private readonly service: PartnerLookupService) {}

  @Get()
  @RequirePermission('accounting.cash_voucher_partner.read')
  list(@Actor() actor: ActorContext) {
    return this.service.depositAccounts(actor);
  }
}
