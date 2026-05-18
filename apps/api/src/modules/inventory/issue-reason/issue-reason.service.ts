import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import {
  IssueReasonPurpose,
  PaginatedResponse,
  PaginationQuery,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { IssueReasonEntity } from './issue-reason.entity';
import { CreateIssueReasonDto } from './dto/create-issue-reason.dto';
import { UpdateIssueReasonDto } from './dto/update-issue-reason.dto';

export interface IssueReasonQuery extends PaginationQuery {
  search?: string;
  purpose?: IssueReasonPurpose;
  activeOnly?: boolean;
}

@Injectable()
export class IssueReasonService {
  private readonly logger = new Logger(IssueReasonService.name);

  constructor(
    @InjectRepository(IssueReasonEntity)
    private readonly repo: Repository<IssueReasonEntity>,
  ) {}

  async list(
    query: IssueReasonQuery,
    actor: ActorContext,
  ): Promise<PaginatedResponse<IssueReasonEntity>> {
    const where: Record<string, unknown> = { organizationId: actor.organizationId };
    if (query.purpose) where.purpose = query.purpose;
    if (query.activeOnly) where.isActive = true;
    if (query.search) {
      where.name = ILike(`%${query.search.trim()}%`);
    }

    const [data, total] = await this.repo.findAndCount({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      order: query.sortBy
        ? { [query.sortBy]: query.sortOrder ?? 'asc' }
        : { name: 'ASC' },
    });

    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  async getById(id: string, actor: ActorContext): Promise<IssueReasonEntity> {
    const found = await this.repo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!found) throw new NotFoundException(`Lý do xuất kho ${id} không tồn tại`);
    return found;
  }

  async create(
    dto: CreateIssueReasonDto,
    actor: ActorContext,
  ): Promise<IssueReasonEntity> {
    const code = (dto.code ?? this.slugify(dto.name)).toUpperCase();
    if (!code) {
      throw new BadRequestException('Không sinh được mã từ tên lý do');
    }

    const duplicate = await this.repo.findOne({
      where: { organizationId: actor.organizationId, code },
    });
    if (duplicate) {
      throw new BadRequestException(`Mã lý do "${code}" đã tồn tại`);
    }

    const entity = this.repo.create({
      organizationId: actor.organizationId,
      branchId: actor.branchId,
      createdBy: actor.userId,
      code,
      name: dto.name.trim(),
      purpose: dto.purpose,
      isActive: dto.isActive ?? true,
    });
    const saved = await this.repo.save(entity);
    this.logger.log(`Created issue reason ${saved.id} (${code})`);
    return saved;
  }

  async update(
    id: string,
    dto: UpdateIssueReasonDto,
    actor: ActorContext,
  ): Promise<IssueReasonEntity> {
    const existing = await this.getById(id, actor);

    if (dto.code && dto.code.toUpperCase() !== existing.code) {
      const code = dto.code.toUpperCase();
      const duplicate = await this.repo.findOne({
        where: { organizationId: actor.organizationId, code },
      });
      if (duplicate && duplicate.id !== id) {
        throw new BadRequestException(`Mã lý do "${code}" đã tồn tại`);
      }
      existing.code = code;
    }

    if (dto.name !== undefined) existing.name = dto.name.trim();
    if (dto.purpose !== undefined) existing.purpose = dto.purpose;
    if (dto.isActive !== undefined) existing.isActive = dto.isActive;

    return this.repo.save(existing);
  }

  async remove(id: string, actor: ActorContext): Promise<void> {
    const existing = await this.getById(id, actor);
    await this.repo.remove(existing);
    this.logger.log(`Deleted issue reason ${id}`);
  }

  private slugify(name: string): string {
    return name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64);
  }
}
