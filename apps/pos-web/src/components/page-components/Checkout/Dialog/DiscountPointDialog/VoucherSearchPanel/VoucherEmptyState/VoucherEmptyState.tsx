import { VoucherIllustration } from "@erp/pos/components/page-components/Checkout/Dialog/DiscountPointDialog/VoucherSearchPanel/VoucherEmptyState/VoucherIllustration/VoucherIllustration";

export function VoucherEmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <VoucherIllustration />
      <div className="flex flex-col gap-1">
        <p className="text-[14px] italic text-[#6B7280]">Nhập mã ưu đãi</p>
        <p className="text-[14px] italic text-[#6B7280]">
          Sau đó nhập Enter để tìm kiếm
        </p>
      </div>
    </div>
  );
}
