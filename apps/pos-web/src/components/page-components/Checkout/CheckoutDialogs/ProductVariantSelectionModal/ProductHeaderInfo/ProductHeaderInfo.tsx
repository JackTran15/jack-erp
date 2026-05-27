import { ShoppingBagIcon } from "@erp/pos/components/common/PosIcons/PosIcons";

export interface ProductHeaderInfoProps {
  name: string;
  description: string | null;
}

const EMPTY = "Chưa có thông tin";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <p className="text-[14px] leading-snug">
      <span className="font-semibold text-[#1F2937]">{label}: </span>
      <span className="text-[#6B7280]">{value?.trim() ? value : EMPTY}</span>
    </p>
  );
}

/**
 * Khối thông tin đầu dialog: ảnh placeholder "Xem" + tên sản phẩm + vị trí
 * lưu kho / trưng bày / mô tả. Các trường vị trí chưa có trong API → "Chưa có
 * thông tin"; mô tả lấy từ chi tiết product nếu có.
 */
export function ProductHeaderInfo({ name, description }: ProductHeaderInfoProps) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-lg bg-[#D1D5DB] text-[#6B7280]">
        <ShoppingBagIcon size={36} strokeWidth={2} className="text-[#9CA3AF]" />
        <span className="mt-1 text-[13px]">Xem</span>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="truncate text-[20px] font-bold leading-tight text-[#1F2937]">
          {name}
        </h2>
        <div className="flex flex-wrap gap-x-12 gap-y-1">
          <Field label="Vị trí lưu kho" value={null} />
          <Field label="Vị trí trưng bày" value={null} />
        </div>
        <Field label="Mô tả" value={description} />
      </div>
    </div>
  );
}
