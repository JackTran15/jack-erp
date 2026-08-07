import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, UseGuards, Version } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiTags } from '@nestjs/swagger';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { CreatePromotionV2Dto } from '../application/dto/create-promotion.dto';
import { UpdatePromotionV2Dto } from '../application/dto/update-promotion.dto';
import { ChangePromotionStatusV2Dto } from '../application/dto/change-promotion-status.dto';
import { PromotionSearchV2Dto } from '../application/dto/promotion-search-v2.dto';
import { EvaluateCartDto } from '../application/dto/evaluate-cart.dto';
import { CreatePromotionCommand } from '../application/commands/create-promotion.command';
import { UpdatePromotionCommand } from '../application/commands/update-promotion.command';
import { DuplicatePromotionCommand } from '../application/commands/duplicate-promotion.command';
import { ChangePromotionStatusCommand } from '../application/commands/change-promotion-status.command';
import { DeletePromotionCommand } from '../application/commands/delete-promotion.command';
import { SearchPromotionsV2Query } from '../application/queries/search-promotions-v2.query';
import { GetPromotionQuery } from '../application/queries/get-promotion.query';
import { EvaluateCartQuery } from '../application/queries/evaluate-cart.query';

@ApiTags('promotions-v2')
@Controller('promotions')
@UseGuards(PermissionGuard, BranchScopeGuard)
export class PromotionV2Controller {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('search')
  @Version('2')
  @RequirePermission('promotion.read')
  search(@Body() dto: PromotionSearchV2Dto, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new SearchPromotionsV2Query(dto, actor));
  }

  @Get(':id')
  @Version('2')
  @RequirePermission('promotion.read')
  getById(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new GetPromotionQuery(id, actor));
  }

  /**
   * Prices a cart without writing anything. Accepts either the back-office
   * `promotion.read` or the cashier-scoped `pos.promotion.evaluate`, because
   * the till needs this endpoint but must not inherit read access to the
   * whole promotion catalogue.
   */
  @Post('evaluate')
  @Version('2')
  @RequirePermission(['promotion.read', 'pos.promotion.evaluate'])
  @RequireBranchScope()
  evaluate(@Body() dto: EvaluateCartDto, @Actor() actor: ActorContext) {
    return this.queryBus.execute(new EvaluateCartQuery(dto, actor));
  }

  @Post()
  @Version('2')
  @RequirePermission('promotion.write')
  create(@Body() dto: CreatePromotionV2Dto, @Actor() actor: ActorContext) {
    return this.commandBus.execute(new CreatePromotionCommand(dto, actor));
  }

  @Put(':id')
  @Version('2')
  @RequirePermission('promotion.write')
  update(@Param('id') id: string, @Body() dto: UpdatePromotionV2Dto, @Actor() actor: ActorContext) {
    return this.commandBus.execute(new UpdatePromotionCommand(id, dto, actor));
  }

  @Post(':id/duplicate')
  @Version('2')
  @RequirePermission('promotion.write')
  duplicate(@Param('id') id: string, @Actor() actor: ActorContext) {
    return this.commandBus.execute(new DuplicatePromotionCommand(id, actor));
  }

  @Patch(':id/status')
  @Version('2')
  @RequirePermission('promotion.write')
  changeStatus(@Param('id') id: string, @Body() dto: ChangePromotionStatusV2Dto, @Actor() actor: ActorContext) {
    return this.commandBus.execute(new ChangePromotionStatusCommand(id, dto, actor));
  }

  @Delete(':id')
  @Version('2')
  @HttpCode(204)
  @RequirePermission('promotion.delete')
  async delete(@Param('id') id: string, @Actor() actor: ActorContext): Promise<void> {
    await this.commandBus.execute(new DeletePromotionCommand(id, actor));
  }
}
