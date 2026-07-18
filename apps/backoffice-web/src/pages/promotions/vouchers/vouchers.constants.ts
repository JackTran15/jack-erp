import type { VoucherStatus } from "./vouchers.types";

interface Option<T extends string> {
  value: T;
  label: string;
}

export const VOUCHER_STATUS_OPTIONS: Option<VoucherStatus>[] = [
  { value: "TRACKING", label: "Đang theo dõi" },
  { value: "STOPPED", label: "Ngừng theo dõi" },
];

export const VOUCHER_STATUS_LABELS: Record<VoucherStatus, string> =
  VOUCHER_STATUS_OPTIONS.reduce(
    (acc, opt) => {
      acc[opt.value] = opt.label;
      return acc;
    },
    {} as Record<VoucherStatus, string>,
  );
