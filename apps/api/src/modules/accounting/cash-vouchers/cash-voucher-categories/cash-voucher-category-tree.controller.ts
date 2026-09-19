import { Body, Controller, Post, UseGuards, Version } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../../auth/decorators';
import { PermissionGuard } from '../../../rbac/permission.guard';
import {
  SearchCashVoucherCategoryTreeDto,
  SearchCashVoucherCategoryTreeResponseDto,
} from './dto/search-cash-voucher-category-tree.dto';
import { SearchCashVoucherCategoryTreeQuery } from './queries/search-cash-voucher-category-tree.query';

@ApiTags('cash-voucher-categories')
@Controller('cash-voucher-categories')
@UseGuards(PermissionGuard)
export class CashVoucherCategoryTreeController {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('tree')
  @Version('2')
  @RequirePermission('accounting.cash_voucher_category.read')
  @ApiOperation({
    summary: 'List cash voucher categories (Mục thu / Mục chi) as a parent → child tree',
  })
  @ApiOkResponse({ type: SearchCashVoucherCategoryTreeResponseDto })
  tree(
    @Body() dto: SearchCashVoucherCategoryTreeDto,
    @Actor() actor: ActorContext,
  ): Promise<SearchCashVoucherCategoryTreeResponseDto> {
    return this.queryBus.execute(
      new SearchCashVoucherCategoryTreeQuery(dto, actor),
    );
  }
}
