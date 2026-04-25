import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PaginationQuery, RegistrationStatus } from '@erp/shared-interfaces';
import { Actor, ActorContext } from '../../common/decorators/actor-context.decorator';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto';
import { RegistrationService } from '../registration/registration.service';
import { RegistrationType } from '../registration/registration-request.entity';

@Controller('organizations')
export class OrganizationController {
  constructor(
    private readonly orgService: OrganizationService,
    @Inject(forwardRef(() => RegistrationService))
    private readonly registrationService: RegistrationService,
  ) {}

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

  /** Must be before @Get(':id') so "registration-requests" is not parsed as a UUID. */
  @Get('registration-requests')
  listOrgRegistrationRequests(
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
