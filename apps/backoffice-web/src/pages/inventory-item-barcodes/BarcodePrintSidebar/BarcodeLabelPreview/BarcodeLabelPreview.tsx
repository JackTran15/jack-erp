import JsBarcode from "jsbarcode";
import { useEffect, useRef } from "react";
import type { BarcodeLabelRow } from "../../_lib/barcode-label-row.type";
import { formatBatchCode } from "../../_lib/render-barcode-labels-html";

const priceFormatter = new Intl.NumberFormat("vi-VN");

/** Dữ liệu mẫu khi bảng chưa có hàng nào (theo spec màn hình). */
const SAMPLE = {
  sku: "VTT01-DE-XS",
  locationCode: "G29.04",
  sellingPrice: 189000,
};

interface Props {
  /** Dòng đầu tiên đã chọn hàng — null thì dùng dữ liệu mẫu. */
  row: BarcodeLabelRow | null;
  /** Mã chi nhánh in trên tem. */
  branchCode: string;
  /** Hiện mã chi nhánh + vị trí. Tắt ở chuỗi cửa hàng. */
  showStoreInfo: boolean;
}

/** "Xem trước": một tem live theo layout MISA (SKU/barcode/giá + vị trí/chi nhánh/ngày). */
export function BarcodeLabelPreview({ row, branchCode, showStoreInfo }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  const data = row ?? SAMPLE;
  const batchCode = formatBatchCode(new Date());

  useEffect(() => {
    const el = svgRef.current;
    if (!el || !data.sku) return;
    try {
      JsBarcode(el, data.sku, {
        format: "CODE128",
        displayValue: false,
        // Quiet zone 10 module mỗi bên, vạch kéo cao kín vùng barcode.
        marginLeft: 14,
        marginRight: 14,
        marginTop: 0,
        marginBottom: 0,
        height: 40,
        width: 1.4,
      });
      el.removeAttribute("width");
      el.removeAttribute("height");
      el.setAttribute("preserveAspectRatio", "none");
    } catch {
      // Giá trị không vẽ được — giữ SVG trống.
    }
  }, [data.sku]);

  return (
    <div>
      <p className="mb-2 text-sm font-bold text-foreground">Xem trước</p>
      <div className="flex items-center justify-center rounded border border-border bg-background py-6">
        {/* Tem mô phỏng bản in nhiệt: luôn đen trên trắng, bất kể theme. */}
        <div className="flex h-[90px] w-[210px] gap-1 border-[1.5px] border-black bg-white px-1.5 py-1 text-black">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="truncate text-center text-[11px] font-bold leading-tight">
              {data.sku}
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center py-0.5">
              <svg ref={svgRef} className="h-full w-full" />
            </div>
            <div className="text-center text-[12px] font-bold leading-tight">
              {priceFormatter.format(data.sellingPrice)} VND
            </div>
          </div>
          <div className="flex w-[22%] shrink-0 flex-col items-end justify-between text-right">
            <span className="text-[10px] font-bold leading-tight">
              {showStoreInfo ? data.locationCode : ""}
            </span>
            <span className="text-[14px] font-bold leading-tight">
              {showStoreInfo ? branchCode : ""}
            </span>
            <span className="text-[10px] font-bold leading-tight">
              {batchCode}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
