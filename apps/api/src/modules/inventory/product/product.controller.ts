import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../crud/audit.interceptor';
import { PaginationQueryDto } from '../../crud/dto';
import { ProductCrudService } from './product-crud.service';
import { VariantGenerationService } from './variant-generation.service';
import { ProductStorageLocationService } from './product-storage-location.service';
import { CreateProductDto, UpdateProductDto, GenerateVariantsDto, ResolveVariantDto } from './dto';

@Controller('products')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
export class ProductController {
  constructor(
    private readonly productService: ProductCrudService,
    private readonly variantService: VariantGenerationService,
    private readonly pslService: ProductStorageLocationService,
  ) {}

  /**
   * Resolve an item's arranged bin ("đã sắp") in a storage — lets the goods-
   * receipt form auto-fill Vị trí when a Kho is picked. Declared before
   * `@Get(':id')` so the static path is not parsed as a UUID.
   */
  @Get('storage-location')
  @RequirePermission('inventory.read')
  resolveStorageLocation(
    @Query('itemId', ParseUUIDPipe) itemId: string,
    @Query('storageId', ParseUUIDPipe) storageId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.pslService.resolveAssignedLocation(
      itemId,
      storageId,
      actor.organizationId,
    );
  }

  @Get()
  @RequirePermission('product.read')
  list(
    @Query() query: PaginationQueryDto,
    @Query('filters') filtersRaw: string | undefined,
    @Actor() actor: ActorContext,
  ) {
    const filters = filtersRaw ? this.parseFilters(filtersRaw) : {};
    return this.productService.list(query, filters, actor);
  }

  @Get(':id')
  @RequirePermission('product.read')
  findById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.productService.getById(id, actor);
  }

  @Post()
  @RequirePermission('product.write')
  create(
    @Body() dto: CreateProductDto,
    @Actor() actor: ActorContext,
  ) {
    return this.productService.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermission('product.write')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @Actor() actor: ActorContext,
  ) {
    return this.productService.update(id, dto, actor);
  }

  @Delete(':id')
  @RequirePermission('product.write')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.productService.remove(id, actor);
  }

  @Post(':id/generate-variants')
  @RequirePermission('product.write')
  generateVariants(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GenerateVariantsDto,
    @Actor() actor: ActorContext,
  ) {
    return this.variantService.generateVariants(id, actor, dto.force);
  }

  @Post(':id/resolve-variant')
  @RequirePermission('product.write')
  resolveVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveVariantDto,
    @Actor() actor: ActorContext,
  ) {
    return this.variantService.resolveOrCreateVariant(id, dto.attributes, actor);
  }

  private parseFilters(raw: string): Record<string, any> {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
}
