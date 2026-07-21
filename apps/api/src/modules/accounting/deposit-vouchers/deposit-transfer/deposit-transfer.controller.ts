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
import { DepositTransferService } from './deposit-transfer.service';
import { CreateDepositTransferDto } from './dto/create-deposit-transfer.dto';
import { ConfirmDepositTransferDto } from './dto/confirm-deposit-transfer.dto';
import { CancelDepositTransferDto } from './dto/cancel-deposit-transfer.dto';
import { ListDepositTransfersQuery } from './dto/list-deposit-transfers.query';

@Controller('deposit-transfers')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class DepositTransferController {
  constructor(private readonly service: DepositTransferService) {}

  @Post()
  @RequirePermission('accounting.deposit_transfer.create')
  create(@Body() dto: CreateDepositTransferDto, @Actor() actor: ActorContext) {
    return this.service.create(dto, actor);
  }

  @Post(':id/confirm')
  @RequirePermission('accounting.deposit_transfer.confirm')
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmDepositTransferDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.confirm(id, dto, actor);
  }

  @Post(':id/cancel')
  @RequirePermission('accounting.deposit_transfer.cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelDepositTransferDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.cancel(id, dto, actor);
  }

  @Get()
  @RequirePermission('accounting.deposit_transfer.read')
  list(@Query() query: ListDepositTransfersQuery, @Actor() actor: ActorContext) {
    return this.service.list(query, actor);
  }

  @Get(':id')
  @RequirePermission('accounting.deposit_transfer.read')
  getById(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.service.getById(id, actor);
  }
}
