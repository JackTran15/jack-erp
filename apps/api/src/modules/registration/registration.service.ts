import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RegistrationStatus,
  PaginationQuery,
  PaginatedResponse,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { OrganizationService } from '../organization/organization.service';
import { BranchService } from '../branch/branch.service';
import {
  RegistrationRequestEntity,
  RegistrationType,
} from './registration-request.entity';
import {
  SubmitOrgRegistrationDto,
  SubmitBranchRegistrationDto,
  RejectRegistrationDto,
} from './dto';

const APPROVABLE_STATUSES = [
  RegistrationStatus.PENDING_APPROVAL,
  RegistrationStatus.RESUBMITTED,
];

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    @InjectRepository(RegistrationRequestEntity)
    private readonly reqRepo: Repository<RegistrationRequestEntity>,
    private readonly orgService: OrganizationService,
    private readonly branchService: BranchService,
  ) {}

  async submitOrgRequest(
    dto: SubmitOrgRegistrationDto,
    actor: ActorContext,
  ): Promise<RegistrationRequestEntity> {
    const request = this.reqRepo.create({
      type: RegistrationType.ORGANIZATION,
      requestData: dto as unknown as Record<string, unknown>,
      status: RegistrationStatus.PENDING_APPROVAL,
      organizationId: actor.organizationId,
      createdBy: actor.userId,
    });

    const saved = await this.reqRepo.save(request);
    this.logger.log(`Org registration request submitted: ${saved.id}`);
    return saved;
  }

  async submitBranchRequest(
    dto: SubmitBranchRegistrationDto,
    actor: ActorContext,
  ): Promise<RegistrationRequestEntity> {
    const request = this.reqRepo.create({
      type: RegistrationType.BRANCH,
      requestData: dto as unknown as Record<string, unknown>,
      status: RegistrationStatus.PENDING_APPROVAL,
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
    });

    const saved = await this.reqRepo.save(request);
    this.logger.log(`Branch registration request submitted: ${saved.id}`);
    return saved;
  }

  async list(
    query: PaginationQuery & { status?: RegistrationStatus; type?: RegistrationType },
    actor: ActorContext,
  ): Promise<PaginatedResponse<RegistrationRequestEntity>> {
    const where: Record<string, unknown> = {
      organizationId: actor.organizationId,
    };
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;

    const [data, total] = await this.reqRepo.findAndCount({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      order: query.sortBy
        ? { [query.sortBy]: query.sortOrder ?? 'asc' }
        : { createdAt: 'DESC' },
    });

    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  async approve(
    id: string,
    actor: ActorContext,
  ): Promise<RegistrationRequestEntity> {
    const request = await this.findById(id);

    if (!APPROVABLE_STATUSES.includes(request.status)) {
      throw new BadRequestException(
        `Cannot approve request in status "${request.status}". Must be PENDING_APPROVAL or RESUBMITTED.`,
      );
    }

    if (request.type === RegistrationType.ORGANIZATION) {
      await this.createOrgFromRequest(request, actor);
    } else {
      await this.createBranchFromRequest(request, actor);
    }

    request.status = RegistrationStatus.APPROVED;
    request.reviewedBy = actor.userId;
    request.reviewedAt = new Date();

    const saved = await this.reqRepo.save(request);
    this.logger.log(`Registration request approved: ${id} by ${actor.userId}`);
    return saved;
  }

  async reject(
    id: string,
    dto: RejectRegistrationDto,
    actor: ActorContext,
  ): Promise<RegistrationRequestEntity> {
    const request = await this.findById(id);

    if (!APPROVABLE_STATUSES.includes(request.status)) {
      throw new BadRequestException(
        `Cannot reject request in status "${request.status}". Must be PENDING_APPROVAL or RESUBMITTED.`,
      );
    }

    request.status = RegistrationStatus.REJECTED;
    request.rejectionReason = dto.reason;
    request.reviewedBy = actor.userId;
    request.reviewedAt = new Date();

    const saved = await this.reqRepo.save(request);
    this.logger.log(`Registration request rejected: ${id} by ${actor.userId}`);
    return saved;
  }

  private async findById(id: string): Promise<RegistrationRequestEntity> {
    const request = await this.reqRepo.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException(`Registration request ${id} not found`);
    }
    return request;
  }

  private async createOrgFromRequest(
    request: RegistrationRequestEntity,
    actor: ActorContext,
  ): Promise<void> {
    const data = request.requestData as {
      organizationName: string;
      contactEmail: string;
      contactPhone?: string;
    };

    const org = await this.orgService.create(
      {
        name: data.organizationName,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
      },
      actor,
    );

    const orgActor: ActorContext = {
      ...actor,
      organizationId: org.id,
    };

    await this.branchService.create(
      { name: `${data.organizationName} - Main Branch` },
      orgActor,
    );
  }

  private async createBranchFromRequest(
    request: RegistrationRequestEntity,
    actor: ActorContext,
  ): Promise<void> {
    const data = request.requestData as {
      branchName: string;
      address?: string;
      phone?: string;
      email?: string;
      parentBranchId?: string;
    };

    await this.branchService.create(
      {
        name: data.branchName,
        address: data.address,
        phone: data.phone,
        email: data.email,
        parentBranchId: data.parentBranchId,
      },
      actor,
    );
  }
}
