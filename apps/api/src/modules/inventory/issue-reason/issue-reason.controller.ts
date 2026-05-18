import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsBooleanString, IsEnum, IsOptional } from 'class-validator';
import { IssueReasonPurpose } from '@erp/shared-interfaces';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../crud/audit.interceptor';
import { PaginationQueryDto } from '../../crud/dto';
import { IssueReasonService } from './issue-reason.service';
import { CreateIssueReasonDto } from './dto/create-issue-reason.dto';
import { UpdateIssueReasonDto } from './dto/update-issue-reason.dto';

class IssueReasonQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(IssueReasonPurpose)
  purpose?: IssueReasonPurpose;

  @IsOptional()
  @IsBooleanString()
  activeOnly?: string;
}

@ApiTags('Inventory · Issue Reasons')
@Controller('inventory/issue-reasons')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
export class IssueReasonController {
  constructor(private readonly service: IssueReasonService) {}

  @Get()
  @RequirePermission('inventory.read')
  list(@Query() query: IssueReasonQueryDto, @Actor() actor: ActorContext) {
    return this.service.list(
      {
        page: query.page,
        pageSize: query.pageSize,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        search: query.search,
        purpose: query.purpose,
        activeOnly: query.activeOnly === 'true',
      },
      actor,
    );
  }

  @Get(':id')
  @RequirePermission('inventory.read')
  getById(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.service.getById(id, actor);
  }

  @Post()
  @RequirePermission('inventory.write')
  create(@Body() dto: CreateIssueReasonDto, @Actor() actor: ActorContext) {
    return this.service.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermission('inventory.write')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIssueReasonDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.update(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('inventory.write')
  async remove(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext): Promise<void> {
    await this.service.remove(id, actor);
  }
}
