import {
  Controller,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
  UseInterceptors,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../crud/audit.interceptor';
import { PaginationQueryDto } from '../../crud/dto';
import { StockLedgerService } from './stock-ledger.service';
import { StockMovementType } from '@erp/shared-interfaces';
import { IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';

export class BalanceQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  itemId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;
}

export class LedgerQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  itemId?: string;

  @IsOptional()
  @IsString()
  locationId?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;

  @IsOptional()
  @IsEnum(StockMovementType)
  movementType?: StockMovementType;
}

@Controller('inventory/stock')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
export class StockLedgerController {
  constructor(private readonly service: StockLedgerService) {}

  @Get('balances')
  @RequirePermission('inventory.read')
  listBalances(
    @Query() query: BalanceQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getBalances({
      ...query,
      organizationId: actor.organizationId,
    });
  }

  @Get('balances/:itemId/:locationId')
  @RequirePermission('inventory.read')
  async getBalance(
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Actor() actor: ActorContext,
  ) {
    const balance = await this.service.getBalance(
      itemId,
      locationId,
      actor.organizationId,
    );
    if (!balance) {
      throw new NotFoundException(
        `No balance found for item ${itemId} at location ${locationId}`,
      );
    }
    return balance;
  }

  @Get('ledger')
  @RequirePermission('inventory.read')
  listLedgerEntries(
    @Query() query: LedgerQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getLedgerEntries({
      ...query,
      organizationId: actor.organizationId,
    });
  }
}
