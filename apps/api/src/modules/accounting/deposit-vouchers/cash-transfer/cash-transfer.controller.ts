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
} from '../../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../../auth/decorators';
import { PermissionGuard } from '../../../rbac/permission.guard';
import { BranchScopeGuard } from '../../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../../crud/audit.interceptor';
import { CashTransferService } from './cash-transfer.service';
import { CreateCashTransferDto } from './dto/create-cash-transfer.dto';
import { ConfirmCashTransferDto } from './dto/confirm-cash-transfer.dto';
import { CancelCashTransferDto } from './dto/cancel-cash-transfer.dto';
import { ListCashTransfersQuery } from './dto/list-cash-transfers.query';

@Controller('cash-transfers')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class CashTransferController {
  constructor(private readonly service: CashTransferService) {}

  @Post()
  @RequirePermission('accounting.cash_transfer.create')
  create(@Body() dto: CreateCashTransferDto, @Actor() actor: ActorContext) {
    return this.service.create(dto, actor);
  }

  @Post(':id/confirm')
  @RequirePermission('accounting.cash_transfer.confirm')
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmCashTransferDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.confirm(id, dto, actor);
  }

  @Post(':id/cancel')
  @RequirePermission('accounting.cash_transfer.cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelCashTransferDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.cancel(id, dto, actor);
  }

  @Get()
  @RequirePermission('accounting.cash_transfer.read')
  list(@Query() query: ListCashTransfersQuery, @Actor() actor: ActorContext) {
    return this.service.list(query, actor);
  }

  @Get(':id')
  @RequirePermission('accounting.cash_transfer.read')
  getById(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.service.getById(id, actor);
  }
}
