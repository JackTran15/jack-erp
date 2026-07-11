import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequirePermission, RequireBranchScope } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../crud/audit.interceptor';
import { PaginationQueryDto } from '../../crud/dto';
import { InventoryLocationService } from './inventory-location.service';
import { ItemProviderService } from './item-provider.service';
import { ItemBarcodeService } from './item-barcode.service';
import { ItemStockThresholdService } from './item-stock-threshold.service';
import { LinkItemProviderDto } from './dto/link-item-provider.dto';
import { CreateItemBarcodeDto } from './dto/create-item-barcode.dto';
import { SetStockThresholdDto } from './dto/set-stock-threshold.dto';
import { ProductGroupsQueryDto, ProductItemsQueryDto } from './dto/product-group-query.dto';
import { InventoryItemCrudService } from './item-crud.service';
import {
  CreateItemDto,
  UpdateItemDto,
  CreateProviderDto,
  UpdateProviderDto,
  CreateStorageDto,
  UpdateStorageDto,
  CreateShowroomDto,
  UpdateShowroomDto,
  CreateLocationDto,
  UpdateLocationDto,
  AssignStorageManagerDto,
  UnassignStorageManagerDto,
} from './dto';

@Controller('inventory')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
export class InventoryLocationController {
  constructor(
    private readonly service: InventoryLocationService,
    private readonly itemCrudService: InventoryItemCrudService,
    private readonly itemProviderService: ItemProviderService,
    private readonly itemBarcodeService: ItemBarcodeService,
    private readonly itemThresholdService: ItemStockThresholdService,
  ) {}

  // ─── Items (org-scoped, no branch required) ───────────────────────

  @Post('items')
  @RequirePermission('inventory.write')
  createItem(
    @Body() dto: CreateItemDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.createItem(dto, actor);
  }

  @Get('items')
  @RequirePermission('inventory.read')
  listItems(
    @Query() query: PaginationQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.listItems(query, actor);
  }

  @Get('items/by-product/:productId')
  @RequirePermission('inventory.read')
  getRepresentativeItemForProduct(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.itemCrudService.getRepresentativeItemForProduct(actor, productId);
  }

  @Get('items/products')
  @RequirePermission('inventory.read')
  listProductGroups(
    @Query() query: ProductGroupsQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.itemCrudService.listProductGroups(actor, query);
  }

  @Get('items/products/:productId')
  @RequirePermission('inventory.read')
  getProductGroup(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.itemCrudService.getProductGroup(actor, productId);
  }

  @Get('items/products/:productId/items')
  @RequirePermission('inventory.read')
  listProductItems(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query() query: ProductItemsQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.itemCrudService.listProductItems(actor, productId, query);
  }

  @Get('items/:id')
  @RequirePermission('inventory.read')
  getItemById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getItemById(id, actor);
  }

  @Patch('items/:id')
  @RequirePermission('inventory.write')
  updateItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateItemDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.updateItem(id, dto, actor);
  }

  // ─── Item ↔ Provider (M2M) ─────────────────────────────────────────

  @Get('items/:id/providers')
  @RequirePermission('inventory.read')
  listItemProviders(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.itemProviderService.list(id, actor);
  }

  @Post('items/:id/providers')
  @RequirePermission('inventory.write')
  linkItemProvider(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkItemProviderDto,
    @Actor() actor: ActorContext,
  ) {
    return this.itemProviderService.link(id, dto, actor);
  }

  @Delete('items/:id/providers/:providerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('inventory.write')
  async unlinkItemProvider(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    await this.itemProviderService.unlink(id, providerId, actor);
  }

  @Patch('items/:id/providers/:providerId/set-primary')
  @RequirePermission('inventory.write')
  setItemProviderPrimary(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.itemProviderService.setPrimary(id, providerId, actor);
  }

  // ─── Item Barcodes ──────────────────────────────────────────────────

  @Get('items/:id/barcodes')
  @RequirePermission('inventory.read')
  listItemBarcodes(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.itemBarcodeService.list(id, actor);
  }

  @Post('items/:id/barcodes')
  @RequirePermission('inventory.write')
  createItemBarcode(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateItemBarcodeDto,
    @Actor() actor: ActorContext,
  ) {
    return this.itemBarcodeService.create(id, dto, actor);
  }

  @Delete('items/:id/barcodes/:barcodeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('inventory.write')
  async deleteItemBarcode(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('barcodeId', ParseUUIDPipe) barcodeId: string,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    await this.itemBarcodeService.delete(id, barcodeId, actor);
  }

  @Get('barcodes/lookup')
  @RequirePermission('inventory.read')
  lookupBarcode(
    @Query('code') code: string,
    @Actor() actor: ActorContext,
  ) {
    return this.itemBarcodeService.lookup(code ?? '', actor);
  }

  // ─── Item Stock Thresholds ──────────────────────────────────────────

  @Get('items/:id/thresholds')
  @RequirePermission('inventory.read')
  listItemThresholds(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.itemThresholdService.list(id, actor);
  }

  @Patch('items/:id/thresholds/default')
  @RequirePermission('inventory.write')
  setDefaultItemThreshold(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetStockThresholdDto,
    @Actor() actor: ActorContext,
  ) {
    return this.itemThresholdService.setDefault(id, dto, actor);
  }

  @Get('items/:id/thresholds/:locationId')
  @RequirePermission('inventory.read')
  getItemThreshold(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.itemThresholdService.getOne(id, locationId, actor);
  }

  @Patch('items/:id/thresholds/:locationId')
  @RequirePermission('inventory.write')
  upsertItemThreshold(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Body() dto: SetStockThresholdDto,
    @Actor() actor: ActorContext,
  ) {
    return this.itemThresholdService.upsert(id, locationId, dto, actor);
  }

  @Delete('items/:id/thresholds/:locationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('inventory.write')
  async deleteItemThreshold(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('locationId', ParseUUIDPipe) locationId: string,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    await this.itemThresholdService.delete(id, locationId, actor);
  }

  // ─── Providers (org-scoped, no branch required) ──────────────────────

  @Get('providers')
  @RequirePermission('inventory.read')
  listProviders(
    @Query() query: PaginationQueryDto & { activeOnly?: string },
    @Actor() actor: ActorContext,
  ) {
    return this.service.listProviders(query, actor);
  }

  @Get('providers/:id')
  @RequirePermission('inventory.read')
  getProviderById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getProviderById(id, actor);
  }

  @Post('providers')
  @RequirePermission('inventory.write')
  createProvider(
    @Body() dto: CreateProviderDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.createProvider(dto, actor);
  }

  @Patch('providers/:id')
  @RequirePermission('inventory.write')
  updateProvider(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.updateProvider(id, dto, actor);
  }

  @Delete('providers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('inventory.write')
  async deleteProvider(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    await this.service.deactivateProvider(id, actor);
  }

  // ─── Branch locations (warehouses + showrooms for X-Branch-Id) ────

  @Get('branch-locations')
  @RequirePermission('inventory.read')
  @RequireBranchScope()
  getBranchLocations(@Actor() actor: ActorContext) {
    return this.service.getBranchLocations(actor);
  }

  // ─── Storages (branch-scoped) ─────────────────────────────────────

  @Post('storages')
  @RequirePermission('inventory.write')
  @RequireBranchScope()
  createStorage(
    @Body() dto: CreateStorageDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.createStorage(dto, actor);
  }

  @Get('storages')
  @RequirePermission('inventory.read')
  listStorages(
    @Query()
    query: PaginationQueryDto & { branchId?: string; activeOnly?: string },
    @Actor() actor: ActorContext,
  ) {
    const activeOnly =
      query.activeOnly === 'true' ||
      (query.activeOnly as unknown) === true ||
      query.activeOnly === '1';
    return this.service.listStorages({ ...query, activeOnly }, actor);
  }

  @Get('storages/:id')
  @RequirePermission('inventory.read')
  getStorageById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getStorageById(id, actor);
  }

  @Patch('storages/:id')
  @RequirePermission('inventory.write')
  updateStorage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStorageDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.updateStorage(id, dto, actor);
  }

  // ─── Showrooms (branch-scoped, under storage) ─────────────────────

  @Post('showrooms')
  @RequirePermission('inventory.write')
  @RequireBranchScope()
  createShowroom(
    @Body() dto: CreateShowroomDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.createShowroom(dto, actor);
  }

  @Get('showrooms')
  @RequirePermission('inventory.read')
  listShowrooms(
    @Query() query: PaginationQueryDto & { branchId?: string; storageId?: string },
    @Actor() actor: ActorContext,
  ) {
    return this.service.listShowrooms(query, actor);
  }

  @Get('showrooms/:id')
  @RequirePermission('inventory.read')
  getShowroomById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getShowroomById(id, actor);
  }

  @Patch('showrooms/:id')
  @RequirePermission('inventory.write')
  updateShowroom(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShowroomDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.updateShowroom(id, dto, actor);
  }

  // ─── Locations (branch-scoped, under storage) ─────────────────────

  @Post('locations')
  @RequirePermission('inventory.write')
  @RequireBranchScope()
  createLocation(
    @Body() dto: CreateLocationDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.createLocation(dto, actor);
  }

  @Get('locations')
  @RequirePermission('inventory.read')
  listLocations(
    @Query()
    query: PaginationQueryDto & {
      storageId?: string;
      branchId?: string;
      includeUnassigned?: string;
      activeOnly?: string;
    },
    @Actor() actor: ActorContext,
  ) {
    const includeUnassigned =
      query.includeUnassigned === 'true' ||
      (query.includeUnassigned as unknown) === true ||
      query.includeUnassigned === '1';
    const activeOnly =
      query.activeOnly === 'true' ||
      (query.activeOnly as unknown) === true ||
      query.activeOnly === '1';
    return this.service.listLocations(
      { ...query, includeUnassigned, activeOnly },
      actor,
    );
  }

  @Get('locations/:id')
  @RequirePermission('inventory.read')
  getLocationById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getLocationById(id, actor);
  }

  @Patch('locations/:id')
  @RequirePermission('inventory.write')
  updateLocation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLocationDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.updateLocation(id, dto, actor);
  }

  // ─── Storage Manager Assignments (branch-scoped) ──────────────────

  @Post('branches/:branchId/storage-managers/assign')
  @RequirePermission('inventory.manage')
  @RequireBranchScope()
  assignStorageManager(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: AssignStorageManagerDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.assignStorageManager(branchId, dto, actor);
  }

  @Post('branches/:branchId/storage-managers/unassign')
  @RequirePermission('inventory.manage')
  @RequireBranchScope()
  unassignStorageManager(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: UnassignStorageManagerDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.unassignStorageManager(branchId, dto, actor);
  }

  @Get('branches/:branchId/storage-managers')
  @RequirePermission('inventory.read')
  @RequireBranchScope()
  listStorageManagers(
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Query() query: PaginationQueryDto & { storageId?: string },
    @Actor() actor: ActorContext,
  ) {
    return this.service.listStorageManagers(branchId, query, actor);
  }
}
