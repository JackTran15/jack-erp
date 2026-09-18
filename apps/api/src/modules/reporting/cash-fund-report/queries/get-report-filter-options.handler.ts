import { BadRequestException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { CASH_FUND_KIND_LABELS_VI, IDropdownOption } from '@erp/shared-interfaces';
import { FindOptionsWhere, ILike, In, Repository } from 'typeorm';
import { BranchEntity } from '../../../branch/branch.entity';
import { RbacService } from '../../../rbac/rbac.service';
import { CASH_CONSOLIDATED } from '../report-definition';
import {
  CashFundFilterOptionType,
  ReportFilterOptionsQueryDto,
} from '../dto/report-filter-options-query.dto';
import { GetReportFilterOptionsQuery } from './get-report-filter-options.query';

@QueryHandler(GetReportFilterOptionsQuery)
export class GetReportFilterOptionsHandler
  implements IQueryHandler<GetReportFilterOptionsQuery>
{
  constructor(
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    private readonly rbac: RbacService,
  ) {}

  async execute({ dto, actor }: GetReportFilterOptionsQuery): Promise<IDropdownOption[]> {
    switch (dto.type) {
      case CashFundFilterOptionType.STORE:
        return this.stores(dto, actor.organizationId, actor.userId, actor.branchIds ?? []);
      case CashFundFilterOptionType.PAYMENT_METHOD:
        return (Object.keys(CASH_FUND_KIND_LABELS_VI) as (keyof typeof CASH_FUND_KIND_LABELS_VI)[]).map(
          (kind) => ({ value: kind, label: CASH_FUND_KIND_LABELS_VI[kind] }),
        );
      // Wired by UOW-02 (employee) and UOW-03 (expenseCategory).
      case CashFundFilterOptionType.EMPLOYEE:
      case CashFundFilterOptionType.EXPENSE_CATEGORY:
        throw new BadRequestException(`Filter option type not available yet: ${dto.type}`);
      default:
        throw new BadRequestException(`Unknown filter option type: ${String(dto.type)}`);
    }
  }

  private take(dto: ReportFilterOptionsQueryDto): number {
    return dto.pageSize ?? 20;
  }

  private skip(dto: ReportFilterOptionsQueryDto): number {
    return ((dto.page ?? 1) - 1) * this.take(dto);
  }

  /**
   * The stores the actor may pick in "Theo nhóm cửa hàng": every branch of the
   * organization for a consolidated reader, otherwise only the assigned ones —
   * the same set `resolveReportBranchIds` would accept, so the picker never
   * offers a store the search would then refuse.
   */
  private async stores(
    dto: ReportFilterOptionsQueryDto,
    org: string,
    userId: string,
    assigned: string[],
  ): Promise<IDropdownOption[]> {
    const hasConsolidated = await this.rbac.hasPermission(userId, org, CASH_CONSOLIDATED);
    if (!hasConsolidated && !assigned.length) return [];
    const where: FindOptionsWhere<BranchEntity> = { organizationId: org };
    if (!hasConsolidated) where.id = In(assigned);
    if (dto.search) where.name = ILike(`%${dto.search}%`);
    const rows = await this.branches.find({
      where,
      order: { name: 'ASC' },
      skip: this.skip(dto),
      take: this.take(dto),
    });
    return rows.map((b) => ({ value: b.id, label: b.name, metadata: { branchId: b.id } }));
  }
}
