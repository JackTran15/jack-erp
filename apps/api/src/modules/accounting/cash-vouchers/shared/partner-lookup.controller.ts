import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import {
  Actor,
  ActorContext,
} from '../../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../../auth/decorators';
import { PermissionGuard } from '../../../rbac/permission.guard';
import { BranchScopeGuard } from '../../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../../crud/audit.interceptor';
import { PartnerLookupService } from './partner-lookup.service';
import { QueryPartnerLookupDto } from './dto/query-partner-lookup.dto';
import { QueryCustomerDebtsDto } from './dto/query-customer-debts.dto';
import { QueryCustomersWithDebtDto } from './dto/query-customers-with-debt.dto';

/**
 * Read-only helpers for the cash-voucher form: pick a party (đối tượng) and list
 * a customer's outstanding debt invoices.
 */
@Controller('cash-vouchers/partners')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class PartnerLookupController {
  constructor(private readonly service: PartnerLookupService) {}

  @Get()
  @RequirePermission('accounting.cash_voucher_partner.read')
  lookup(@Query() query: QueryPartnerLookupDto, @Actor() actor: ActorContext) {
    return this.service.lookup(query, actor);
  }

  @Get('debts')
  @RequirePermission('accounting.cash_voucher_partner.read')
  customerDebts(
    @Query() query: QueryCustomerDebtsDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.customerDebts(query, actor);
  }

  @Get('customers-with-debt')
  @RequirePermission('accounting.cash_voucher_partner.read')
  customersWithDebt(
    @Query() query: QueryCustomersWithDebtDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.customersWithDebt(query, actor);
  }
}
