import { Body, Controller, Delete, Param, Post, Put, UseGuards, Version } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiTags } from '@nestjs/swagger';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { VoucherService } from '../voucher.service';
import { CreateVoucherDto } from '../dto/create-voucher.dto';
import { DuplicateVoucherDto } from '../dto/duplicate-voucher.dto';
import { VoucherSearchV2Dto } from '../application/dto/voucher-search-v2.dto';
import { SearchVouchersV2Query } from '../application/queries/search-vouchers-v2.query';

@ApiTags('vouchers-v2')
@Controller('vouchers')
@UseGuards(PermissionGuard)
export class VoucherV2Controller {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly voucherService: VoucherService,
  ) {}

  @Post('search')
  @Version('2')
  @RequirePermission('promotion.read')
  search(@Body() dto: VoucherSearchV2Dto, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new SearchVouchersV2Query(dto, actor));
  }

  @Post()
  @Version('2')
  @RequirePermission('promotion.write')
  create(@Body() dto: CreateVoucherDto, @Actor() actor: ActorContext) {
    return this.voucherService.create(dto, actor);
  }

  @Put(':id')
  @Version('2')
  @RequirePermission('promotion.write')
  update(@Param('id') id: string, @Body() dto: Partial<CreateVoucherDto>, @Actor() actor: ActorContext) {
    return this.voucherService.update(id, dto, actor);
  }

  @Post(':id/duplicate')
  @Version('2')
  @RequirePermission('promotion.write')
  duplicate(@Param('id') id: string, @Body() dto: DuplicateVoucherDto, @Actor() actor: ActorContext) {
    return this.voucherService.duplicate(id, dto.code, actor);
  }

  @Delete(':id')
  @Version('2')
  @RequirePermission('promotion.delete')
  deactivate(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.voucherService.deactivate(id, actor);
  }
}
