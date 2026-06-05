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
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PaginationQuery, RegistrationStatus } from '@erp/shared-interfaces';
import { Actor, ActorContext } from '../../common/decorators/actor-context.decorator';
import { BranchService } from './branch.service';
import { CreateBranchDto, UpdateBranchDto } from './dto';
import { RegistrationService } from '../registration/registration.service';
import { RegistrationType } from '../registration/registration-request.entity';

@Controller('branches')
export class BranchController {
  constructor(
    private readonly branchService: BranchService,
    @Inject(forwardRef(() => RegistrationService))
    private readonly registrationService: RegistrationService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateBranchDto,
    @Actor() actor: ActorContext,
  ) {
    return this.branchService.create(dto, actor);
  }

  @Get()
  list(
    @Query() query: PaginationQuery & { branchId?: string },
    @Actor() actor: ActorContext,
  ) {
    return this.branchService.list(
      {
        page: Number(query.page) || 1,
        pageSize: Number(query.pageSize) || 20,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        branchId: query.branchId,
      },
      actor,
    );
  }

  @Get('main')
  findMainBranch(@Actor() actor: ActorContext) {
    return this.branchService.findMainBranch(actor);
  }

  /** Must be before @Get(':id') so "registration-requests" is not parsed as a UUID. */
  @Get('registration-requests')
  listBranchRegistrationRequests(
    @Query() query: PaginationQuery & { status?: RegistrationStatus },
    @Actor() actor: ActorContext,
  ) {
    return this.registrationService.list(
      {
        page: Number(query.page) || 1,
        pageSize: Number(query.pageSize) || 20,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        status: query.status,
        type: RegistrationType.BRANCH,
      },
      actor,
    );
  }

  @Get('users/:userId/branches')
  getUserBranches(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.branchService.getUserBranches(userId, actor);
  }

  @Get('me')
  listMyBranches(@Actor() actor: ActorContext) {
    return this.branchService.listMyBranches(actor);
  }

  @Get(':id')
  findById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.branchService.findById(id, actor);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
    @Actor() actor: ActorContext,
  ) {
    return this.branchService.update(id, dto, actor);
  }

  @Post(':id/archive')
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.branchService.archive(id, actor);
  }

  @Post(':id/suspend')
  suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.branchService.suspend(id, actor);
  }

  @Post(':id/assign-user/:userId')
  assignUser(
    @Param('id', ParseUUIDPipe) branchId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.branchService.assignUser(branchId, userId, actor);
  }

  @Delete(':id/assign-user/:userId')
  unassignUser(
    @Param('id', ParseUUIDPipe) branchId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Actor() actor: ActorContext,
  ) {
    return this.branchService.unassignUser(branchId, userId, actor);
  }
}
