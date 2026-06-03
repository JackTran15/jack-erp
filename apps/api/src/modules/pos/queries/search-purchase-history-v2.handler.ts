import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FilterBuilder } from '../../../common/filters/filter.builder';
import { BranchEntity } from '../../branch/branch.entity';
import { InvoiceEntity } from '../entities/invoice.entity';
import { SearchPurchaseHistoryV2Query } from './search-purchase-history-v2.query';

@QueryHandler(SearchPurchaseHistoryV2Query)
export class SearchPurchaseHistoryV2Handler
  implements IQueryHandler<SearchPurchaseHistoryV2Query>
{
  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly repo: Repository<InvoiceEntity>,
  ) {}

  async execute({ dto, actor }: SearchPurchaseHistoryV2Query) {
    const page  = dto.page  ?? 1;
    const limit = dto.limit ?? 20;

    const qb = this.repo
      .createQueryBuilder('inv')
      .leftJoinAndMapOne(
        'inv.branch',
        BranchEntity,
        'branch',
        'branch.id = inv.branch_id::uuid',
      )
      .where('inv.organizationId = :orgId', { orgId: actor.organizationId })
      .andWhere('inv.customerId = :cid', { cid: dto.customerId })
      .andWhere('inv.isDraft = false');

    new FilterBuilder(qb)
      .applyString('inv.code',       dto.code)
      .applyDateRange('inv.issuedAt', dto.issuedAt)
      .applyString('branch.name',    dto.storeName)
      .applyEnum('inv.status',       dto.status?.value)
      .applyCompare('inv.totalPaid', dto.totalPaid)
      .applyString('inv.note',       dto.note);

    qb.orderBy('inv.issuedAt', 'DESC')
      .addOrderBy('inv.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }
}
