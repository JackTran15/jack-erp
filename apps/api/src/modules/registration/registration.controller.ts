import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { PaginationQuery, RegistrationStatus } from '@erp/shared-interfaces';
import { Actor, ActorContext } from '../../common/decorators/actor-context.decorator';
import { RegistrationService } from './registration.service';
import { RegistrationType } from './registration-request.entity';
import {
  SubmitOrgRegistrationDto,
  SubmitBranchRegistrationDto,
  RejectRegistrationDto,
} from './dto';

@Controller()
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  @Post('organizations/registration-requests')
  submitOrgRequest(
    @Body() dto: SubmitOrgRegistrationDto,
    @Actor() actor: ActorContext,
  ) {
    return this.registrationService.submitOrgRequest(dto, actor);
  }

  @Post('branches/registration-requests')
  submitBranchRequest(
    @Body() dto: SubmitBranchRegistrationDto,
    @Actor() actor: ActorContext,
  ) {
    return this.registrationService.submitBranchRequest(dto, actor);
  }

  @Get('organizations/registration-requests')
  listOrgRequests(
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
        type: RegistrationType.ORGANIZATION,
      },
      actor,
    );
  }

  @Get('branches/registration-requests')
  listBranchRequests(
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

  @Post('organizations/registration-requests/:id/approve')
  approveOrgRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.registrationService.approve(id, actor);
  }

  @Post('organizations/registration-requests/:id/reject')
  rejectOrgRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectRegistrationDto,
    @Actor() actor: ActorContext,
  ) {
    return this.registrationService.reject(id, dto, actor);
  }

  @Post('branches/registration-requests/:id/approve')
  approveBranchRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.registrationService.approve(id, actor);
  }

  @Post('branches/registration-requests/:id/reject')
  rejectBranchRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectRegistrationDto,
    @Actor() actor: ActorContext,
  ) {
    return this.registrationService.reject(id, dto, actor);
  }
}
