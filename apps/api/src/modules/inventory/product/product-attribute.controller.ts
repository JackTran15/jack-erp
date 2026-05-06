import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { ProductAttributeService } from './product-attribute.service';
import { CreateAttributeDefinitionDto } from './dto/create-attribute-definition.dto';
import { CreateAttributeOptionDto } from './dto/create-attribute-option.dto';

@Controller('products/:productId/attributes')
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class ProductAttributeController {
  constructor(private readonly attributeService: ProductAttributeService) {}

  @Get()
  @RequirePermission('product.read')
  list(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.attributeService.listDefinitions(productId, actor);
  }

  @Post()
  @RequirePermission('product.write')
  createDefinition(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: CreateAttributeDefinitionDto,
    @Actor() actor: ActorContext,
  ) {
    return this.attributeService.createDefinition(productId, dto, actor);
  }

  @Patch(':id')
  @RequirePermission('product.write')
  updateDefinition(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAttributeDefinitionDto,
    @Actor() actor: ActorContext,
  ) {
    return this.attributeService.updateDefinition(productId, id, dto, actor);
  }

  @Delete(':id')
  @RequirePermission('product.write')
  deleteDefinition(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.attributeService.deleteDefinition(productId, id, actor);
  }

  @Post(':attrDefId/options')
  @RequirePermission('product.write')
  createOption(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('attrDefId', ParseUUIDPipe) attrDefId: string,
    @Body() dto: CreateAttributeOptionDto,
    @Actor() actor: ActorContext,
  ) {
    return this.attributeService.createOption(productId, attrDefId, dto, actor);
  }

  @Patch(':attrDefId/options/:optionId')
  @RequirePermission('product.write')
  updateOption(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('attrDefId', ParseUUIDPipe) attrDefId: string,
    @Param('optionId', ParseUUIDPipe) optionId: string,
    @Body() dto: CreateAttributeOptionDto,
    @Actor() actor: ActorContext,
  ) {
    return this.attributeService.updateOption(productId, attrDefId, optionId, dto, actor);
  }

  @Delete(':attrDefId/options/:optionId')
  @RequirePermission('product.write')
  deleteOption(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('attrDefId', ParseUUIDPipe) attrDefId: string,
    @Param('optionId', ParseUUIDPipe) optionId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.attributeService.deleteOption(productId, attrDefId, optionId, actor);
  }
}
