import { useState } from "react";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { ProductImage } from "@erp/pos/components/page-components/Checkout/ProductImage/ProductImage";
import { ShoppingBagIcon } from "@erp/pos/components/common/PosIcons/PosIcons";

export interface ProductHeaderInfoProps {
  name: string;
  description: string | null;
  /** Ảnh đầu tiên của sản phẩm (`PosProductDetail.imageUrl`); null khi chưa có. */
  imageUrl: string | null;
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

function ImagePlaceholder() {
  return (
    <div className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-lg bg-[#D1D5DB] text-[#6B7280]">
      <ShoppingBagIcon size={36} strokeWidth={2} className="text-[#9CA3AF]" />
      <span className="mt-1 text-[13px]">Xem</span>
    </div>
  );
}

/**
 * Khối thông tin đầu dialog: thumbnail ảnh sản phẩm (bấm "Xem" mở ảnh cỡ lớn
 * trong một PosDialog lồng — Esc chỉ đóng lớp trên cùng) hoặc placeholder túi
 * khi chưa có ảnh; tên sản phẩm; vị trí lưu kho / trưng bày / mô tả. Các
 * trường vị trí chưa có trong API → "Chưa có thông tin"; mô tả lấy từ chi tiết
 * product nếu có.
 */
export function ProductHeaderInfo({ name, description, imageUrl }: ProductHeaderInfoProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  return (
    <div className="flex items-start gap-4">
      {imageUrl === null ? (
        <ImagePlaceholder />
      ) : (
        <button
          type="button"
          aria-label={`Xem ảnh ${name}`}
          onClick={() => setViewerOpen(true)}
          className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-[#D1D5DB] focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30"
        >
          <ProductImage
            key={imageUrl}
            src={imageUrl}
            alt={name}
            loading="eager"
            className="absolute inset-0 h-full w-full object-cover"
            fallback={<ImagePlaceholder />}
          />
          <span className="absolute inset-x-0 bottom-0 bg-black/40 py-0.5 text-center text-[12px] text-white">
            Xem
          </span>
        </button>
      )}
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
      {imageUrl !== null && (
        <PosDialog open={viewerOpen} onClose={() => setViewerOpen(false)} width={720}>
          <PosDialog.Header title={name} />
          <PosDialog.Body className="flex min-h-[40vh] items-center justify-center bg-[#111827] p-4">
            <img
              src={imageUrl}
              alt={name}
              className="max-h-[70vh] w-auto max-w-full object-contain"
            />
          </PosDialog.Body>
        </PosDialog>
      )}
    </div>
  );
}
