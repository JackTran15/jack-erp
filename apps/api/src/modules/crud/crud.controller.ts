import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  NotFoundException,
  UseInterceptors,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ActorContext, Actor } from '../../common/decorators/actor-context.decorator';
import { EntityRegistryService } from './entity-registry.service';
import { BaseCrudService } from './base-crud.service';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { AuditInterceptor } from './audit.interceptor';

@Controller('admin/entities')
@UseInterceptors(AuditInterceptor)
export class CrudController {
  constructor(
    private readonly registry: EntityRegistryService,
    private readonly moduleRef: ModuleRef,
  ) {}

  @Get()
  listEntities() {
    return this.registry.getAllEntities();
  }

  @Get(':entityKey')
  getEntityConfig(@Param('entityKey') entityKey: string) {
    const config = this.registry.getEntityConfig(entityKey);
    if (!config) {
      throw new NotFoundException(`Entity "${entityKey}" is not registered`);
    }
    return config;
  }

  @Get(':entityKey/records')
  async listRecords(
    @Param('entityKey') entityKey: string,
    @Query() query: PaginationQueryDto,
    @Query('filters') filtersRaw: string | undefined,
    @Actor() actor: ActorContext,
  ) {
    const service = this.resolveService(entityKey);
    const filters = this.parseFilters(filtersRaw);
    return service.list(query, filters, actor);
  }

  @Post(':entityKey/records')
  async createRecord(
    @Param('entityKey') entityKey: string,
    @Body() body: Record<string, any>,
    @Actor() actor: ActorContext,
  ) {
    const service = this.resolveService(entityKey);
    return service.create(body, actor);
  }

  @Patch(':entityKey/records/:id')
  async updateRecord(
    @Param('entityKey') entityKey: string,
    @Param('id') id: string,
    @Body() body: Record<string, any>,
    @Actor() actor: ActorContext,
  ) {
    const service = this.resolveService(entityKey);
    return service.update(id, body, actor);
  }

  @Delete(':entityKey/records/:id')
  async deleteRecord(
    @Param('entityKey') entityKey: string,
    @Param('id') id: string,
    @Actor() actor: ActorContext,
  ) {
    const service = this.resolveService(entityKey);
    await service.remove(id, actor);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private resolveService(entityKey: string): BaseCrudService<any, any, any> {
    const registration = this.registry.getRegistration(entityKey);
    if (!registration) {
      throw new NotFoundException(`Entity "${entityKey}" is not registered`);
    }
    try {
      return this.moduleRef.get(registration.serviceToken, { strict: false });
    } catch {
      throw new NotFoundException(
        `Service for entity "${entityKey}" could not be resolved`,
      );
    }
  }

  private parseFilters(raw: string | undefined): Record<string, any> {
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
}
