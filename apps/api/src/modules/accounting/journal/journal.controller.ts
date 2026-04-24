import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { RequireBranchScope } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { AuditInterceptor } from '../../crud/audit.interceptor';
import { JournalService, JournalListQuery } from './journal.service';
import { PostJournalDto, ReverseJournalDto } from './dto';
import { JournalSource, JournalStatus } from '@erp/shared-interfaces';

@Controller('journals')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class JournalController {
  constructor(private readonly journalService: JournalService) {}

  @Post('post')
  @RequirePermission('accounting.journal.post')
  post(
    @Body() dto: PostJournalDto,
    @Actor() actor: ActorContext,
  ) {
    return this.journalService.post(dto, actor);
  }

  @Post(':id/reverse')
  @RequirePermission('accounting.journal.reverse')
  reverse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReverseJournalDto,
    @Actor() actor: ActorContext,
  ) {
    return this.journalService.reverse(id, dto.reason, actor);
  }

  @Get()
  @RequirePermission('accounting.journal.post')
  list(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('source') source?: JournalSource,
    @Query('status') status?: JournalStatus,
    @Query('branchId') branchId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Actor() actor?: ActorContext,
  ) {
    const query: JournalListQuery = {
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      source,
      status,
      branchId,
      dateFrom,
      dateTo,
    };
    return this.journalService.list(query, actor!);
  }

  @Get(':id')
  @RequirePermission('accounting.journal.post')
  findById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.journalService.getById(id, actor);
  }
}
