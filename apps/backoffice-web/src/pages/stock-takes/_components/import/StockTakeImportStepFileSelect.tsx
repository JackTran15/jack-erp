import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ImportFilePicker } from "../../../inventory/_components/import/ImportFilePicker";
import { downloadStockTakeTemplate } from "./import-stock-take.api";

interface Props {
  file: File | null;
  onFileChange: (file: File | null) => void;
  countByValue: boolean;
}

const IMPORT_FILE_ACCEPT =
  ".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";

const INTRO_BULLETS = [
  "Nhập nhanh kết quả kiểm kê kho từ tệp Excel hoặc CSV.",
  "Mã SKU và vị trí phải thuộc kho đang kiểm kê.",
  "Chỉ các dòng đã nhập số lượng hoặc giá trị kiểm kê mới được cập nhật.",
  "Kiểm tra dữ liệu và tải các dòng lỗi trước khi hoàn thành nhập khẩu.",
];

function isSupportedImportFile(file: File): boolean {
  const lowerName = file.name.toLowerCase();
  return [".xlsx", ".xls", ".csv"].some((extension) =>
    lowerName.endsWith(extension),
  );
}

export function StockTakeImportStepFileSelect({
  file,
  onFileChange,
  countByValue,
}: Props) {
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);

  const handleDownloadTemplate = async () => {
    try {
      setIsDownloadingTemplate(true);
      await downloadStockTakeTemplate(countByValue);
    } catch {
      toast.error("Không thể tải tệp mẫu. Vui lòng thử lại.");
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <section>
        <p className="text-sm font-medium text-foreground">
          Nhập khẩu kết quả kiểm kê đáp ứng nhu cầu:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {INTRO_BULLETS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section className="flex gap-6">
        <div className="w-44 shrink-0 pt-1">
          <p className="text-sm font-medium text-foreground">
            Chọn tệp nhập khẩu:
          </p>
          <button
            type="button"
            className="mt-1 inline-flex items-center gap-1 text-left text-sm text-[#2563eb] hover:underline disabled:opacity-60"
            disabled={isDownloadingTemplate}
            onClick={() => void handleDownloadTemplate()}
          >
            {isDownloadingTemplate ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : null}
            (Tải tệp mẫu tại đây)
          </button>
        </div>
        <ImportFilePicker
          accept={IMPORT_FILE_ACCEPT}
          file={file}
          onFileChange={onFileChange}
          validateFile={(pickedFile) => {
            const supported = isSupportedImportFile(pickedFile);
            if (!supported) {
              toast.error("Tệp nhập khẩu phải có định dạng Excel hoặc CSV.");
            }
            return supported;
          }}
        />
      </section>
    </div>
  );
}
