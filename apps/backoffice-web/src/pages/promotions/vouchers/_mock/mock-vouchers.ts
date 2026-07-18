import type { VoucherRow } from "../vouchers.types";

/** Dữ liệu giả cho danh sách thẻ voucher (UI-first, chưa nối API). */
export const MOCK_VOUCHER_ROWS: VoucherRow[] = [
  {
    id: "vc-tet-100",
    issuer: "Công ty ABC",
    code: "TET100K",
    startDate: "2026-01-15",
    endDate: "2026-02-28",
    description: "Voucher Tết mệnh giá 100.000đ",
    faceValue: 100000,
    totalQuantity: 500,
    totalVoucherValue: 50000000,
    totalAppliedValue: 32000000,
    status: "TRACKING",
  },
  {
    id: "vc-sinh-nhat",
    issuer: "Chi nhánh Hà Nội",
    code: "BDAY50K",
    startDate: "2026-03-01",
    endDate: "2026-12-31",
    description: "Voucher sinh nhật khách hàng",
    faceValue: 50000,
    totalQuantity: 1000,
    totalVoucherValue: 50000000,
    totalAppliedValue: 12500000,
    status: "TRACKING",
  },
  {
    id: "vc-he-200",
    issuer: "Công ty ABC",
    code: "SUMMER200",
    startDate: "2026-06-01",
    endDate: "2026-08-31",
    description: "Voucher hè mệnh giá 200.000đ",
    faceValue: 200000,
    totalQuantity: 300,
    totalVoucherValue: 60000000,
    totalAppliedValue: 0,
    status: "STOPPED",
  },
];
