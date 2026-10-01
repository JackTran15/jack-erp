import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppModal, Button } from "@erp/ui";
import { PromotionDiscountMode } from "@erp/shared-interfaces";
import { ImportFilePicker } from "../../../../../../../../components/shared/import-wizard/ImportFilePicker";
import { getUserFacingApiErrorMessage } from "../../../../../../../../lib/user-facing-api-error";
import {
  downloadItemDiscountExcel,
  importItemDiscountExcel,
  type ImportedItemDiscountLine,
  type ImportItemDiscountLinesResult,
  type ItemDiscountExcelMethod,
} from "../../../../../../api/item-discount-excel.api";

const XLSX_ACCEPT =
  ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

interface Props {
  method: ItemDiscountExcelMethod;
  onOpenChange: (open: boolean) => void;
  /** Gộp các dòng hợp lệ vào lưới — không lưu chương trình (AC-22). */
  onApply: (rows: ImportedItemDiscountLine[]) => void;
}

export function ItemDiscountImportDialog({ method, onOpenChange, onApply }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ImportItemDiscountLinesResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  // File mẫu = xuất khẩu với `lines: []` — 3 sheet chỉ có tiêu đề (A-07, AC-14).
  const downloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      await downloadItemDiscountExcel(method, []);
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err) || "Tải file mẫu thất bại");
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const check = async (picked: File | null) => {
    setFile(picked);
    setResult(null);
    setFileError(null);
    if (!picked) return;
    if (!picked.name.toLowerCase().endsWith(".xlsx")) {
      setFileError("File không đúng định dạng .xlsx");
      return;
    }
    setChecking(true);
    try {
      setResult(await importItemDiscountExcel(method, picked));
    } catch (err) {
      setFileError(getUserFacingApiErrorMessage(err) || "Nhập khẩu thất bại");
    } finally {
      setChecking(false);
    }
  };

  const validCount = result?.rows.length ?? 0;

  return (
    <AppModal
      open
      onOpenChange={onOpenChange}
      title="Nhập khẩu hàng hóa giảm giá"
      defaultWidth={760}
      defaultHeight={560}
      bodyClassName="flex flex-col gap-3 overflow-hidden"
      saveLabel="Áp dụng"
      saveDisabled={!validCount}
      onSave={() => {
        if (result) onApply(result.rows);
        onOpenChange(false);
      }}
    >
      <ImportFilePicker
        accept={XLSX_ACCEPT}
        file={file}
        onFileChange={check}
        className="min-h-[140px] flex-none"
      />

      <div className="flex-none">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={downloadingTemplate}
          onClick={downloadTemplate}
        >
          <Download className="mr-1 h-4 w-4" />
          Tải file mẫu
        </Button>
      </div>

      {checking ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Đang kiểm tra file…
        </p>
      ) : null}

      {fileError ? (
        <p role="alert" className="text-sm text-destructive">
          {fileError}
        </p>
      ) : null}

      {result ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 text-sm">
          <p>
            <span className="font-medium">{validCount}</span> dòng hợp lệ,{" "}
            <span className="font-medium text-destructive">{result.errors.length}</span> dòng lỗi.
            Các dòng hợp lệ sẽ được thêm vào bảng (
            {method === PromotionDiscountMode.FIXED_PRICE
              ? "mã đã có được giữ nguyên"
              : "mã đã có thì cập nhật giá trị"}
            ).
            Bấm <span className="font-medium">Lưu</span> để lưu chương trình.
          </p>
          {result.errors.length ? (
            <div className="min-h-0 flex-1 overflow-auto rounded border border-border">
              <table className="erp-data-table w-full text-sm" aria-label="Dòng lỗi">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="w-20 px-2 py-1.5 text-left font-semibold">Dòng</th>
                    <th className="w-40 px-2 py-1.5 text-left font-semibold">Mã SKU</th>
                    <th className="px-2 py-1.5 text-left font-semibold">Lý do</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((err) => (
                    <tr key={err.rowNumber} className="border-t border-border">
                      <td className="px-2 py-1.5 tabular-nums">{err.rowNumber}</td>
                      <td className="px-2 py-1.5">{err.code ?? ""}</td>
                      <td className="px-2 py-1.5 text-destructive">{err.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </AppModal>
  );
}
