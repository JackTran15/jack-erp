import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { BankReceiptsService } from './bank-receipts.service';
import { CreateBankReceiptDto } from './dto/create-bank-receipt.dto';
import { UpdateBankReceiptDto } from './dto/update-bank-receipt.dto';
import { ReverseBankReceiptDto } from './dto/reverse-bank-receipt.dto';
import { QueryBankReceiptDto } from './dto/query-bank-receipt.dto';

@Controller('bank-receipts')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class BankReceiptsController {
  constructor(private readonly service: BankReceiptsService) {}

  @Post()
  @RequirePermission('accounting.bank_receipt.create')
  create(@Body() dto: CreateBankReceiptDto, @Actor() actor: ActorContext) {
    return this.service.create(dto, actor);
  }

  @Get()
  @RequirePermission('accounting.bank_receipt.read')
  list(@Query() query: QueryBankReceiptDto, @Actor() actor: ActorContext) {
    return this.service.list(query, actor);
  }

  @Get(':id')
  @RequirePermission('accounting.bank_receipt.read')
  getById(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.service.getById(id, actor);
  }

  @Patch(':id')
  @RequirePermission('accounting.bank_receipt.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBankReceiptDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.update(id, dto, actor);
  }

  @Delete(':id')
  @RequirePermission('accounting.bank_receipt.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.service.delete(id, actor);
  }

  @Post(':id/post')
  @RequirePermission('accounting.bank_receipt.post')
  post(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.service.post(id, actor);
  }

  @Post(':id/reverse')
  @RequirePermission('accounting.bank_receipt.reverse')
  reverse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseBankReceiptDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.reverse(id, dto.reason, actor);
  }
}
