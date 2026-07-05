import { Button, Input, Separator } from "@erp/ui";
import {
  CloudUpload,
  FolderOpen,
  HelpCircle,
  Loader2,
  Printer,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { RadioGroup } from "../../../components/forms/RadioGroup";
import type {
  BarcodeStandard,
} from "../../../store/page-stores/inventory-item-barcodes/barcode-print-settings.interface";
import { useBarcodePrintSettingsStore } from "../../../store/page-stores/inventory-item-barcodes/barcode-print-settings.store";
import type { BarcodeLabelRow } from "../_lib/barcode-label-row.type";
import { BarcodeLabelPreview } from "./BarcodeLabelPreview/BarcodeLabelPreview";
import { PaperCustomizationSection } from "./PaperCustomizationSection/PaperCustomizationSection";

const STANDARD_OPTIONS = [
  { value: "CODE128", label: "Code 128" },
  { value: "EAN13", label: "EAN-13" },
] as const;

const STANDARD_HELPER: Record<BarcodeStandard, string> = {
  CODE128:
    "Mã không giới hạn số lượng ký tự, tuy nhiên nên sử dụng mã vạch dài không quá 13 ký tự để máy quét mã vạch có thể nhận diện.",
  EAN13:
    "Mã gồm 12–13 chữ số theo chuẩn EAN-13. Mã không đúng định dạng sẽ được in bằng Code 128.",
};

interface Props {
  /** Dòng đầu tiên đã chọn hàng — nguồn dữ liệu cho tem xem trước. */
  previewRow: BarcodeLabelRow | null;
  printing: boolean;
  onPrint: () => void;
  onCancel: () => void;
}

/** Sidebar cấu hình in tem: mẫu tem, thông tin bổ sung, chuẩn in, khổ giấy, xem trước, hành động. */
export function BarcodePrintSidebar({
  previewRow,
  printing,
  onPrint,
  onCancel,
}: Props) {
  const standard = useBarcodePrintSettingsStore((s) => s.standard);
  const setStandard = useBarcodePrintSettingsStore((s) => s.setStandard);
  const showUnit = useBarcodePrintSettingsStore((s) => s.showUnit);
  const setShowUnit = useBarcodePrintSettingsStore((s) => s.setShowUnit);

  return (
    <aside className="flex w-[370px] shrink-0 flex-col overflow-hidden rounded-md border bg-background">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <div className="flex items-center gap-2">
          <Input
            className="h-9 flex-1"
            placeholder="Chọn mẫu bạn tự thiết kế"
            readOnly
            onClick={() => toast.info("Chưa hỗ trợ mẫu tem tự thiết kế")}
          />
          <Button
            type="button"
            variant="outline"
            className="h-9 gap-2"
            onClick={() => toast.info("Chưa hỗ trợ mẫu tem tự thiết kế")}
          >
            <FolderOpen className="h-4 w-4 text-primary" />
            Chọn mẫu
          </Button>
        </div>

        <div>
          <p className="mb-2 text-sm font-bold text-foreground">
            Thông tin bổ sung
          </p>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 accent-primary"
              checked={showUnit}
              onChange={(e) => setShowUnit(e.target.checked)}
            />
            Đơn vị tính
          </label>
        </div>

        <div>
          <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
            In theo chuẩn
            <HelpCircle
              className="h-3.5 w-3.5 text-muted-foreground"
              aria-label="Trợ giúp chuẩn in"
            />
          </p>
          <RadioGroup
            name="barcode-standard"
            value={standard}
            options={STANDARD_OPTIONS}
            onChange={setStandard}
          />
          <p className="mt-2 text-[13px] leading-relaxed text-foreground">
            {STANDARD_HELPER[standard]}
          </p>
        </div>

        <PaperCustomizationSection />

        <BarcodeLabelPreview row={previewRow} />

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
