import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Brings every existing organization's cash voucher categories (Mục thu / Mục
 * chi) up to the default list: 14 new expense categories, two renamed ones,
 * and expense display orders re-sequenced to follow the user-supplied grouping.
 *
 * `CashVoucherCategorySeederService.seedForOrganization` only runs when an
 * organization is created, so a code added to DEFAULT_CASH_VOUCHER_CATEGORIES
 * never reaches organizations that already exist — BANK_FEE was added that way
 * and organizations seeded before it still lack it.
 *
 * Nothing an organization changed itself is overwritten, and nothing is deleted:
 * - a rename or display-order move only touches rows still holding the old default;
 * - a category is inserted only when the organization has no row with that code
 *   (soft-deleted rows included: UQ_cash_voucher_categories_org_code covers them,
 *   and a category the organization deleted stays deleted) and no live category
 *   of the same direction with the same name under another code.
 *
 * Re-running is a no-op.
 */

interface DefaultCategory {
  code: string;
  name: string;
  direction: 'IN' | 'OUT';
  displayOrder: number;
}

// Mirrors DEFAULT_CASH_VOUCHER_CATEGORIES in cash-voucher-category.seeder.ts.
// Kept as a literal: a migration must describe the data as of the moment it
// ran, not follow later edits to application code.
const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { code: 'THU_BAN_HANG', name: 'Thu từ bán hàng', direction: 'IN', displayOrder: 1 },
  { code: 'THU_KHAC', name: 'Thu khác', direction: 'IN', displayOrder: 2 },
  { code: 'THU_THANH_LY_TS', name: 'Thu thanh lý tài sản', direction: 'IN', displayOrder: 3 },
  { code: 'THU_BAN_PHE_LIEU', name: 'Thu từ bán phế liệu', direction: 'IN', displayOrder: 4 },
  { code: 'THU_HOAN_UNG', name: 'Thu hoàn ứng', direction: 'IN', displayOrder: 5 },
  { code: 'THU_CH_KHAC', name: 'Thu từ cửa hàng khác chuyển đến', direction: 'IN', displayOrder: 6 },
  { code: 'THU_TIEN_MAT_NHAP_QUY', name: 'Thu nhận tiền mặt về nhập quỹ', direction: 'IN', displayOrder: 7 },
  { code: 'THU_TIEN_GUI_NH', name: 'Thu nhận tiền gửi vào ngân hàng', direction: 'IN', displayOrder: 8 },
  { code: 'THU_NO_KH', name: 'Thu nợ khách hàng', direction: 'IN', displayOrder: 9 },
  { code: 'CHI_TIEN_DIEN', name: 'Tiền điện', direction: 'OUT', displayOrder: 10 },
  { code: 'CHI_TIEN_DIEN_THOAI', name: 'Tiền điện thoại', direction: 'OUT', displayOrder: 11 },
  { code: 'CHI_TIEN_INTERNET', name: 'Tiền internet', direction: 'OUT', displayOrder: 12 },
  { code: 'CHI_TIEN_NUOC', name: 'Tiền nước sinh hoạt', direction: 'OUT', displayOrder: 13 },
  { code: 'CHI_THUE_CUA_HANG', name: 'Tiền thuê cửa hàng', direction: 'OUT', displayOrder: 14 },
  { code: 'CHI_TIEN_VAN_CHUYEN', name: 'Tiền vận chuyển', direction: 'OUT', displayOrder: 15 },
  { code: 'CHI_DUNG_CU_SUA_DEP', name: 'Mua dụng cụ sửa dép', direction: 'OUT', displayOrder: 16 },
  { code: 'CHI_LUONG', name: 'Tiền lương', direction: 'OUT', displayOrder: 17 },
  { code: 'CHI_THUONG', name: 'Tiền thưởng', direction: 'OUT', displayOrder: 18 },
  { code: 'CHI_PHU_CAP', name: 'Tiền phụ cấp', direction: 'OUT', displayOrder: 19 },
  { code: 'CHI_UNG_LUONG', name: 'Ứng lương', direction: 'OUT', displayOrder: 20 },
  { code: 'CHI_CCDC', name: 'Mua đồ dùng, công cụ, dụng cụ', direction: 'OUT', displayOrder: 21 },
  { code: 'CHI_TSCD', name: 'Tài sản cố định', direction: 'OUT', displayOrder: 22 },
  { code: 'CHI_MAY_MOC_THIET_BI', name: 'Mua máy móc thiết bị', direction: 'OUT', displayOrder: 23 },
  { code: 'CHI_KHAC', name: 'Chi khác', direction: 'OUT', displayOrder: 24 },
  { code: 'CHI_TIEP_KHACH', name: 'Chi tiếp khách', direction: 'OUT', displayOrder: 25 },
  { code: 'CHI_VAN_PHONG_PHAM', name: 'Mua văn phòng phẩm', direction: 'OUT', displayOrder: 26 },
  { code: 'CHI_TAM_UNG', name: 'Chi tạm ứng', direction: 'OUT', displayOrder: 27 },
  { code: 'CHI_THUE_MUON_KHAC', name: 'Thuê mướn khác', direction: 'OUT', displayOrder: 28 },
  { code: 'CHI_VE_SINH_MOI_TRUONG', name: 'Chi vệ sinh môi trường', direction: 'OUT', displayOrder: 29 },
  { code: 'CHI_LY_DO_KHAC', name: 'Chi lý do khác', direction: 'OUT', displayOrder: 30 },
  { code: 'CHI_MUA_HANG', name: 'Chi mua hàng hóa', direction: 'OUT', displayOrder: 31 },
  { code: 'CHI_CHUYEN_TIEN_CH', name: 'Chi chuyển tiền sang cửa hàng khác', direction: 'OUT', displayOrder: 32 },
  { code: 'CHI_RUT_TIEN_GUI', name: 'Rút tiền gửi về nhập quỹ', direction: 'OUT', displayOrder: 33 },
  { code: 'CHI_GUI_TIEN_NH', name: 'Chi gửi tiền vào ngân hàng', direction: 'OUT', displayOrder: 34 },
  { code: 'CHI_AN_UONG', name: 'Chi ăn uống', direction: 'OUT', displayOrder: 35 },
  { code: 'CHI_XANG_DAU_NHOT', name: 'Mua xăng dầu nhớt', direction: 'OUT', displayOrder: 36 },
  { code: 'CHI_NAP_VETC', name: 'Nạp VETC', direction: 'OUT', displayOrder: 37 },
  { code: 'CHI_LAM_HANG', name: 'Làm Hàng', direction: 'OUT', displayOrder: 38 },
  { code: 'CHI_DO_DUNG_VE_SINH', name: 'Đồ dùng vệ sinh', direction: 'OUT', displayOrder: 39 },
  { code: 'CHI_TIEN_AN', name: 'Tiền ăn', direction: 'OUT', displayOrder: 40 },
  { code: 'CHI_TIEN_NUOC_UONG', name: 'Tiền nước uống', direction: 'OUT', displayOrder: 41 },
  { code: 'CHI_NO_NCC', name: 'Chi trả nợ nhà cung cấp', direction: 'OUT', displayOrder: 42 },
  { code: 'BANK_FEE', name: 'Phí ngân hàng', direction: 'OUT', displayOrder: 43 },
];

const RENAMES: { code: string; from: string; to: string }[] = [
  { code: 'CHI_TIEN_NUOC', from: 'Tiền nước', to: 'Tiền nước sinh hoạt' },
  { code: 'CHI_CCDC', from: 'Công cụ dụng cụ', to: 'Mua đồ dùng, công cụ, dụng cụ' },
];

/** The previous default display_order of every category whose position moved. */
const PREVIOUS_DISPLAY_ORDER: Record<string, number> = {
  CHI_LUONG: 15,
  CHI_THUONG: 16,
  CHI_PHU_CAP: 17,
  CHI_CCDC: 18,
  CHI_TSCD: 19,
  CHI_KHAC: 20,
  CHI_TIEP_KHACH: 21,
  CHI_VAN_PHONG_PHAM: 22,
  CHI_TAM_UNG: 23,
  CHI_MUA_HANG: 24,
  CHI_CHUYEN_TIEN_CH: 25,
  CHI_RUT_TIEN_GUI: 26,
  CHI_GUI_TIEN_NH: 27,
  CHI_NO_NCC: 28,
  BANK_FEE: 29,
};

export class BackfillCashVoucherCategoryOptions1789930000000
  implements MigrationInterface
{
  name = 'BackfillCashVoucherCategoryOptions1789930000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const rename of RENAMES) {
      await queryRunner.query(
        `UPDATE "cash_voucher_categories"
            SET "name" = $1, "updated_at" = now()
          WHERE "code" = $2 AND "name" = $3`,
        [rename.to, rename.code, rename.from],
      );
    }

    for (const category of DEFAULT_CATEGORIES) {
      const previous = PREVIOUS_DISPLAY_ORDER[category.code];
      if (previous === undefined) continue;
      await queryRunner.query(
        `UPDATE "cash_voucher_categories"
            SET "display_order" = $1, "updated_at" = now()
          WHERE "code" = $2 AND "display_order" = $3`,
        [category.displayOrder, category.code, previous],
      );
    }

    for (const category of DEFAULT_CATEGORIES) {
      await queryRunner.query(
        `INSERT INTO "cash_voucher_categories"
           ("organization_id", "code", "name", "direction", "is_active", "display_order", "created_by")
         SELECT o."id"::varchar, $1::varchar, $2::varchar,
                $3::cash_voucher_category_direction_enum, true, $4::int, 'migration'
           FROM "organizations" o
          WHERE NOT EXISTS (
                  SELECT 1 FROM "cash_voucher_categories" c
                   WHERE c."organization_id" = o."id"::varchar
                     AND c."code" = $1::varchar
                )
            AND NOT EXISTS (
                  SELECT 1 FROM "cash_voucher_categories" c
                   WHERE c."organization_id" = o."id"::varchar
                     AND c."direction" = $3::cash_voucher_category_direction_enum
                     AND c."deleted_at" IS NULL
                     AND lower(btrim(c."name")) = lower(btrim($2::varchar))
                )`,
        [category.code, category.name, category.direction, category.displayOrder],
      );
    }
  }

  /**
   * Intentionally a no-op: inserted categories may already be referenced by
   * voucher lines, and the renamed/re-ordered rows are indistinguishable from
   * later hand edits, so undoing either would be destructive.
   */
  public async down(): Promise<void> {}
}
