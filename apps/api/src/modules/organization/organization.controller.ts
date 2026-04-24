import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { PaginationQuery } from '@erp/shared-interfaces';
import { Actor, ActorContext } from '../../common/decorators/actor-context.decorator';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto';

@Controller('organizations')
export class OrganizationController {
  constructor(private readonly orgService: OrganizationService) {}

  @Post()
  create(
    @Body() dto: CreateOrganizationDto,
    @Actor() actor: ActorContext,
  ) {
    return this.orgService.create(dto, actor);
  }

  @Get()
  list(
    @Query() query: PaginationQuery,
    @Actor() actor: ActorContext,
  ) {
    return this.orgService.list(
      { page: Number(query.page) || 1, pageSize: Number(query.pageSize) || 20, sortBy: query.sortBy, sortOrder: query.sortOrder },
      actor,
    );
  }

  @Get(':id')
  findById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.orgService.findById(id, actor);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
    @Actor() actor: ActorContext,
  ) {
    return this.orgService.update(id, dto, actor);
  }
}
