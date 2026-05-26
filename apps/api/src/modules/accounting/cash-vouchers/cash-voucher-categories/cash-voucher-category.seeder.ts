import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CashVoucherCategoryDirection } from '../enums';
import { CashVoucherCategoryEntity } from './cash-voucher-category.entity';

interface DefaultCategory {
  code: string;
  name: string;
  direction: CashVoucherCategoryDirection;
  displayOrder: number;
}

/** Default cash voucher categories (Mục thu / Mục chi) seeded per organization. */
export const DEFAULT_CASH_VOUCHER_CATEGORIES: DefaultCategory[] = [
  { code: 'THU_BAN_HANG', name: 'Thu bán hàng', direction: CashVoucherCategoryDirection.IN, displayOrder: 1 },
  { code: 'THU_NO_KH', name: 'Thu nợ khách hàng', direction: CashVoucherCategoryDirection.IN, displayOrder: 2 },
  { code: 'THU_KHAC', name: 'Thu khác', direction: CashVoucherCategoryDirection.IN, displayOrder: 3 },
  { code: 'CHI_MUA_HANG', name: 'Chi mua hàng', direction: CashVoucherCategoryDirection.OUT, displayOrder: 4 },
  { code: 'CHI_NO_NCC', name: 'Chi trả nợ nhà cung cấp', direction: CashVoucherCategoryDirection.OUT, displayOrder: 5 },
  { code: 'CHI_LUONG', name: 'Chi lương', direction: CashVoucherCategoryDirection.OUT, displayOrder: 6 },
  { code: 'CHI_KHAC', name: 'Chi khác', direction: CashVoucherCategoryDirection.OUT, displayOrder: 7 },
  { code: 'CHI_CHUYEN_TM_TIEN_GUI', name: 'Chuyển tiền mặt thành tiền gửi', direction: CashVoucherCategoryDirection.OUT, displayOrder: 8 },
  { code: 'CHI_CHUYEN_CH_KHAC', name: 'Chuyển tiền đến cửa hàng khác', direction: CashVoucherCategoryDirection.OUT, displayOrder: 9 },
];

@Injectable()
export class CashVoucherCategorySeederService {
  private readonly logger = new Logger(CashVoucherCategorySeederService.name);

  constructor(
    @InjectRepository(CashVoucherCategoryEntity)
    private readonly categoryRepo: Repository<CashVoucherCategoryEntity>,
  ) {}

  /**
   * Idempotently seed default categories for an organization (upsert by
   * (organization_id, code)). Safe to re-run.
   */
  async seedForOrganization(
    organizationId: string,
    actorId: string,
  ): Promise<number> {
    const existing = await this.categoryRepo.find({
      where: { organizationId },
      withDeleted: true,
    });
    const existingCodes = new Set(existing.map((c) => c.code));

    const toInsert = DEFAULT_CASH_VOUCHER_CATEGORIES.filter(
      (c) => !existingCodes.has(c.code),
    );
    if (toInsert.length === 0) {
      this.logger.log(
        `Org ${organizationId} already has cash voucher categories, skipping seed`,
      );
      return 0;
    }

    await this.categoryRepo.save(
      toInsert.map((c) =>
        this.categoryRepo.create({
          organizationId,
          code: c.code,
          name: c.name,
          direction: c.direction,
          displayOrder: c.displayOrder,
          isActive: true,
          createdBy: actorId,
        }),
      ),
    );

    this.logger.log(
      `Seeded ${toInsert.length} cash voucher categories for organization ${organizationId}`,
    );
    return toInsert.length;
  }
}
