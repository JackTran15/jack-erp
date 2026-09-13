import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CashVoucherCategoryDirection } from "../enums";
import { CashVoucherCategoryEntity } from "./cash-voucher-category.entity";

interface DefaultCategory {
  code: string;
  name: string;
  direction: CashVoucherCategoryDirection;
  displayOrder: number;
}

/**
 * Default cash voucher categories (Mục thu / Mục chi) seeded per organization.
 * Only organizations created after a change here pick it up — existing ones
 * need a data migration (see 1789930000000-BackfillCashVoucherCategoryOptions).
 */
export const DEFAULT_CASH_VOUCHER_CATEGORIES: DefaultCategory[] = [
  // ── Mục thu (IN) ──
  {
    code: "THU_BAN_HANG",
    name: "Thu từ bán hàng",
    direction: CashVoucherCategoryDirection.IN,
    displayOrder: 1,
  },
  {
    code: "THU_KHAC",
    name: "Thu khác",
    direction: CashVoucherCategoryDirection.IN,
    displayOrder: 2,
  },
  {
    code: "THU_THANH_LY_TS",
    name: "Thu thanh lý tài sản",
    direction: CashVoucherCategoryDirection.IN,
    displayOrder: 3,
  },
  {
    code: "THU_BAN_PHE_LIEU",
    name: "Thu từ bán phế liệu",
    direction: CashVoucherCategoryDirection.IN,
    displayOrder: 4,
  },
  {
    code: "THU_HOAN_UNG",
    name: "Thu hoàn ứng",
    direction: CashVoucherCategoryDirection.IN,
    displayOrder: 5,
  },
  {
    code: "THU_CH_KHAC",
    name: "Thu từ cửa hàng khác chuyển đến",
    direction: CashVoucherCategoryDirection.IN,
    displayOrder: 6,
  },
  {
    code: "THU_TIEN_MAT_NHAP_QUY",
    name: "Thu nhận tiền mặt về nhập quỹ",
    direction: CashVoucherCategoryDirection.IN,
    displayOrder: 7,
  },
  {
    code: "THU_TIEN_GUI_NH",
    name: "Thu nhận tiền gửi vào ngân hàng",
    direction: CashVoucherCategoryDirection.IN,
    displayOrder: 8,
  },
  {
    code: "THU_NO_KH",
    name: "Thu nợ khách hàng",
    direction: CashVoucherCategoryDirection.IN,
    displayOrder: 9,
  },

  // ── Mục chi (OUT) ──
  {
    code: "CHI_TIEN_DIEN",
    name: "Tiền điện",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 10,
  },
  {
    code: "CHI_TIEN_DIEN_THOAI",
    name: "Tiền điện thoại",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 11,
  },
  {
    code: "CHI_TIEN_INTERNET",
    name: "Tiền internet",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 12,
  },
  {
    code: "CHI_TIEN_NUOC",
    name: "Tiền nước sinh hoạt",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 13,
  },
  {
    code: "CHI_THUE_CUA_HANG",
    name: "Tiền thuê cửa hàng",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 14,
  },
  {
    code: "CHI_TIEN_VAN_CHUYEN",
    name: "Tiền vận chuyển",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 15,
  },
  {
    code: "CHI_DUNG_CU_SUA_DEP",
    name: "Mua dụng cụ sửa dép",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 16,
  },
  {
    code: "CHI_LUONG",
    name: "Tiền lương",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 17,
  },
  {
    code: "CHI_THUONG",
    name: "Tiền thưởng",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 18,
  },
  {
    code: "CHI_PHU_CAP",
    name: "Tiền phụ cấp",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 19,
  },
  {
    code: "CHI_UNG_LUONG",
    name: "Ứng lương",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 20,
  },
  {
    code: "CHI_CCDC",
    name: "Mua đồ dùng, công cụ, dụng cụ",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 21,
  },
  {
    code: "CHI_TSCD",
    name: "Tài sản cố định",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 22,
  },
  {
    code: "CHI_MAY_MOC_THIET_BI",
    name: "Mua máy móc thiết bị",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 23,
  },
  {
    code: "CHI_KHAC",
    name: "Chi khác",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 24,
  },
  {
    code: "CHI_TIEP_KHACH",
    name: "Chi tiếp khách",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 25,
  },
  {
    code: "CHI_VAN_PHONG_PHAM",
    name: "Mua văn phòng phẩm",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 26,
  },
  {
    code: "CHI_TAM_UNG",
    name: "Chi tạm ứng",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 27,
  },
  {
    code: "CHI_THUE_MUON_KHAC",
    name: "Thuê mướn khác",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 28,
  },
  {
    code: "CHI_VE_SINH_MOI_TRUONG",
    name: "Chi vệ sinh môi trường",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 29,
  },
  {
    code: "CHI_LY_DO_KHAC",
    name: "Chi lý do khác",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 30,
  },
  {
    code: "CHI_MUA_HANG",
    name: "Chi mua hàng hóa",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 31,
  },
  {
    code: "CHI_CHUYEN_TIEN_CH",
    name: "Chi chuyển tiền sang cửa hàng khác",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 32,
  },
  {
    code: "CHI_RUT_TIEN_GUI",
    name: "Rút tiền gửi về nhập quỹ",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 33,
  },
  {
    code: "CHI_GUI_TIEN_NH",
    name: "Chi gửi tiền vào ngân hàng",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 34,
  },
  {
    code: "CHI_AN_UONG",
    name: "Chi ăn uống",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 35,
  },
  {
    code: "CHI_XANG_DAU_NHOT",
    name: "Mua xăng dầu nhớt",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 36,
  },
  {
    code: "CHI_NAP_VETC",
    name: "Nạp VETC",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 37,
  },
  {
    code: "CHI_LAM_HANG",
    name: "Làm Hàng",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 38,
  },
  {
    code: "CHI_DO_DUNG_VE_SINH",
    name: "Đồ dùng vệ sinh",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 39,
  },
  {
    code: "CHI_TIEN_AN",
    name: "Tiền ăn",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 40,
  },
  {
    code: "CHI_TIEN_NUOC_UONG",
    name: "Tiền nước uống",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 41,
  },
  {
    code: "CHI_NO_NCC",
    name: "Chi trả nợ nhà cung cấp",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 42,
  },
  {
    code: "BANK_FEE",
    name: "Phí ngân hàng",
    direction: CashVoucherCategoryDirection.OUT,
    displayOrder: 43,
  },
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
