import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PromotionStatus } from '@erp/shared-interfaces';
import { FilterBuilder } from '../../../../common/filters/filter.builder';
import { VoucherEntity } from '../../voucher.entity';
import { toIsoDate } from '../date-format.util';
import { SearchVouchersV2Query } from './search-vouchers-v2.query';

export interface VoucherSummaryRow {
  issuer?: string;
  code: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  faceValue: number;
  totalQuantity: number;
  totalVoucherValue: number;
  totalAppliedValue: number;
  status: PromotionStatus;
}

export interface VoucherTotals {
  totalQuantity: number;
  totalVoucherValue: number;
  totalAppliedValue: number;
}

export interface SearchVouchersV2Result {
  data: VoucherSummaryRow[];
  total: number;
  page: number;
  limit: number;
  summary: VoucherTotals;
}

@QueryHandler(SearchVouchersV2Query)
export class SearchVouchersV2Handler implements IQueryHandler<SearchVouchersV2Query> {
  constructor(
    @InjectRepository(VoucherEntity)
    private readonly repo: Repository<VoucherEntity>,
  ) {}

  async execute({ dto, actor }: SearchVouchersV2Query): Promise<SearchVouchersV2Result> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;

    const qb = this.repo.createQueryBuilder('v').where('v.organizationId = :orgId', { orgId: actor.organizationId });

    new FilterBuilder(qb)
      .applyString('v.issuer', dto.issuer)
      .applyString('v.code', dto.code)
      .applyString('v.description', dto.description)
      .applyDateRange('v.validFrom', dto.startDate)
      .applyDateRange('v.validTo', dto.endDate)
      .applyEnum('v.status', dto.status?.value)
      .applyCompare('v.faceValue', dto.faceValue);

    qb.orderBy('v.createdAt', 'DESC');

    // The 3 aggregate columns are grouped by `code` and computed in RAM, not
    // SQL GROUP BY — repo convention for summary views. `code` is unique per
    // org today (uq_voucher_org_code), so every group has exactly 1 row;
    // grouping here matches the ticket's own future-proofing for batch-issued
    // vouchers sharing a code.
    const rows = await qb.getMany();

    const groups = new Map<string, VoucherEntity[]>();
    for (const row of rows) {
      const bucket = groups.get(row.code);
      if (bucket) bucket.push(row);
      else groups.set(row.code, [row]);
    }

    const allSummaries: VoucherSummaryRow[] = [...groups.values()].map((groupRows) => {
      const first = groupRows[0];
      const totalQuantity = groupRows.length;
      const totalVoucherValue = Number(first.faceValue) * totalQuantity;
      const totalAppliedValue = groupRows.filter((r) => r.isUsed).reduce((sum, r) => sum + Number(r.faceValue), 0);

      return {
        issuer: first.issuer,
        code: first.code,
        startDate: toIsoDate(first.validFrom),
        endDate: toIsoDate(first.validTo),
        description: first.description,
        faceValue: Number(first.faceValue),
        totalQuantity,
        totalVoucherValue,
        totalAppliedValue,
        status: first.status,
      };
    });

    // Summary totals are computed over the whole filtered set, not just the current page.
    const summary: VoucherTotals = allSummaries.reduce(
      (acc, row) => ({
        totalQuantity: acc.totalQuantity + row.totalQuantity,
        totalVoucherValue: acc.totalVoucherValue + row.totalVoucherValue,
        totalAppliedValue: acc.totalAppliedValue + row.totalAppliedValue,
      }),
      { totalQuantity: 0, totalVoucherValue: 0, totalAppliedValue: 0 },
    );

    const data = allSummaries.slice((page - 1) * limit, (page - 1) * limit + limit);

    return { data, total: allSummaries.length, page, limit, summary };
  }
}
