import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { RequireBranchScope } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../crud/audit.interceptor';
import { CashService, CashListQuery, CashMovementListQuery } from './cash.service';
import { CreateCashAccountDto, RecordCashMovementDto } from './dto';
import { CashMovementType } from './cash-movement.entity';
import { CashAccountType } from './cash-account.entity';

@Controller('cash')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class CashController {
  constructor(private readonly cashService: CashService) {}

  @Post('accounts')
  @RequirePermission('accounting.cash.create')
  createAccount(
    @Body() dto: CreateCashAccountDto,
    @Actor() actor: ActorContext,
  ) {
    return this.cashService.createAccount(dto, actor);
  }

  @Get('accounts')
  @RequirePermission('accounting.cash.read')
  listAccounts(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('branchId') branchId?: string,
    @Query('type') type?: CashAccountType,
    @Actor() actor?: ActorContext,
  ) {
    const query: CashListQuery = {
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      branchId,
      type,
    };
    return this.cashService.listAccounts(query, actor!);
  }

  @Get('accounts/:id')
  @RequirePermission('accounting.cash.read')
  getAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.cashService.getAccount(id, actor);
  }

  @Post('movements')
  @RequirePermission('accounting.cash.create')
  async recordMovement(
    @Body() dto: RecordCashMovementDto,
    @Actor() actor: ActorContext,
  ) {
    const { movement } = await this.cashService.recordMovement(dto, actor);
    return movement;
  }

  @Get('movements')
  @RequirePermission('accounting.cash.read')
  listMovements(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('cashAccountId') cashAccountId?: string,
    @Query('type') type?: CashMovementType,
    @Query('branchId') branchId?: string,
    @Actor() actor?: ActorContext,
  ) {
    const query: CashMovementListQuery = {
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      cashAccountId,
      type,
      branchId,
    };
    return this.cashService.listMovements(query, actor!);
  }
}
