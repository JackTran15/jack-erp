import { ReportGroupBy } from '@erp/shared-interfaces';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { BranchEntity } from '../../branch/branch.entity';
import { ItemCategoryEntity } from '../../inventory/location/item-category.entity';
import { InvoiceReportFilterDto } from './dto/invoice-report-filter.dto';
import {
  GROUP_BY_LABELS_VI,
  PRODUCT_TYPE_LABELS_VI,
} from './queries/get-invoice-report-document.handler';
import {
  FILTERED_MARKER,
  filterSummarySubtitle,
} from '../report-core/report-export.service';

const ALL_STORES_LABEL = 'Toàn hệ thống';
const ALL_CATEGORIES_LABEL = 'Tất cả nhóm';
const ALL_BRANDS_LABEL = 'Tất cả';
const DEFAULT_PRODUCT_TYPE = 'product';

/**
 * Parameter line for `revenue-by-item`, matching the reference MISA export:
 * six parts always print, with defaults for whatever the request left unset,
 * unlike `invoiceFilterSummary` (`get-invoice-report-document.handler.ts`)
 * which only names filters that were actually applied. The other three
 * invoice reports keep that rule unchanged (ADR-02) — this builder is
 * additive, not a replacement.
 *
 * Needs real branch/category names (not the `đã lọc` marker
 * `invoiceFilterSummary` uses for ids), so it is async and injects
 * repositories rather than staying a pure function.
 */
@Injectable()
export class RevenueByItemParamsBuilder {
  constructor(
    @InjectRepository(BranchEntity)
    private readonly branches: Repository<BranchEntity>,
    @InjectRepository(ItemCategoryEntity)
    private readonly categories: Repository<ItemCategoryEntity>,
  ) {}

  async build(
    filters: InvoiceReportFilterDto | undefined,
    actor: ActorContext,
  ): Promise<string[]> {
    if (!filters) return [];

    const [storeLabel, categoryLabel] = await Promise.all([
      this.storeLabel(filters, actor),
      this.categoryLabel(filters, actor),
    ]);

    return filterSummarySubtitle([
      `Xem theo cửa hàng: ${storeLabel}`,
      `Nhóm hàng hóa: ${categoryLabel}`,
      `Thống kê theo: ${GROUP_BY_LABELS_VI[filters.statBy ?? ReportGroupBy.ITEM]}`,
      // ERP has no per-branch row split for this report, so this line is a
      // constant statement of fact rather than a value read from the request.
      'Thống kê theo chi nhánh: Không',
      // `productType` has no backing field on the catalogue item yet — see
      // RevenueByItemReport.buildData — so this always reads "Hàng hóa" today.
      `Loại hàng hóa: ${PRODUCT_TYPE_LABELS_VI[filters.productType ?? DEFAULT_PRODUCT_TYPE]}`,
      `Thương hiệu: ${filters.brand ?? ALL_BRANDS_LABEL}`,
      filters.statisticByBrand ? 'Thống kê theo thương hiệu: Có' : null,
      filters.allocateComboRevenue ? 'Phân bổ doanh thu combo: Có' : null,
    ]);
  }

  private async storeLabel(
    filters: InvoiceReportFilterDto,
    actor: ActorContext,
  ): Promise<string> {
    if (filters.store?.scope === 'all') return ALL_STORES_LABEL;
    if (filters.store?.scope === 'group') {
      const { storeIds } = filters.store;
      if (storeIds.length === 1) {
        return this.branchName(storeIds[0], actor.organizationId);
      }
      return `${storeIds.length} cửa hàng được chọn`;
    }
    if (!actor.branchId) return FILTERED_MARKER;
    return this.branchName(actor.branchId, actor.organizationId);
  }

  private async branchName(id: string, organizationId: string): Promise<string> {
    const branch = await this.branches.findOne({
      where: { id, organizationId },
    });
    return branch?.name ?? FILTERED_MARKER;
  }

  private async categoryLabel(
    filters: InvoiceReportFilterDto,
    actor: ActorContext,
  ): Promise<string> {
    if (!filters.categoryId) return ALL_CATEGORIES_LABEL;
    const category = await this.categories.findOne({
      where: { id: filters.categoryId, organizationId: actor.organizationId },
    });
    return category?.name ?? FILTERED_MARKER;
  }
}
