import { Button, Separator } from "@erp/ui";
import { CloudUpload, Loader2, Printer, X } from "lucide-react";
import type { BarcodeLabelRow } from "../_lib/barcode-label-row.type";
import { BarcodeLabelPreview } from "./BarcodeLabelPreview/BarcodeLabelPreview";
import { PaperCustomizationSection } from "./PaperCustomizationSection/PaperCustomizationSection";

interface Props {
  /** Dòng đầu tiên đã chọn hàng — nguồn dữ liệu cho tem xem trước. */
  previewRow: BarcodeLabelRow | null;
  /** Mã chi nhánh in trên tem. */
  branchCode: string;
  /** Hiện mã chi nhánh + vị trí trên tem xem trước. Tắt ở chuỗi cửa hàng. */
  showStoreInfo: boolean;
  printing: boolean;
  onPrint: () => void;
  onCancel: () => void;
}

/** Sidebar cấu hình in tem: khổ giấy, xem trước, hành động. */
export function BarcodePrintSidebar({
  previewRow,
  branchCode,
  showStoreInfo,
  printing,
  onPrint,
  onCancel,
}: Props) {
  return (
    <aside className="flex w-[370px] shrink-0 flex-col overflow-hidden rounded-md border bg-background">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <PaperCustomizationSection />

        <BarcodeLabelPreview
          row={previewRow}
          branchCode={branchCode}
          showStoreInfo={showStoreInfo}
        />

        <p className="text-xs text-muted-foreground">
          Khi in, chọn tỉ lệ 100% (không "Fit to page") để tem đúng kích thước.
        </p>
      </div>

      <Separator />
      <div className="flex items-center justify-between gap-2 p-3">
        <Button
          type="button"
          variant="ghost"
          className="gap-2"
          onClick={onCancel}
        >
          <X className="h-4 w-4" />
          Hủy bỏ
        </Button>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            disabled
            title="Chưa hỗ trợ xuất khẩu"
          >
            <CloudUpload className="h-4 w-4" />
            Xuất khẩu
          </Button>
          <Button
            type="button"
            className="gap-2"
            onClick={onPrint}
            disabled={printing}
          >
            {printing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Printer className="h-4 w-4" />
            )}
            In tem
          </Button>
        </div>
      </div>
    </aside>
  );
}
