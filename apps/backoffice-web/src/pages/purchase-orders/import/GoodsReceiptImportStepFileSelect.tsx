import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ImportFilePicker } from "../../../components/shared/import-wizard/ImportFilePicker";
import {
  downloadGoodsReceiptTemplate,
  getGoodsReceiptImportErrorMessage,
} from "./import-goods-receipt.api";

interface Props {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

const ACCEPT =
  ".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";

export function GoodsReceiptImportStepFileSelect({ file, onFileChange }: Props) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      await downloadGoodsReceiptTemplate();
    } catch (error) {
      toast.error(
        await getGoodsReceiptImportErrorMessage(
          error,
          "Không thể tải tệp mẫu. Vui lòng thử lại.",
        ),
      );
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <section>
        <p className="text-sm font-medium">Nhập khẩu hàng hóa vào phiếu nhập kho:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Nhập Mã SKU hoặc Mã vạch, Kho, Vị trí và Số lượng.</li>
          <li>Đơn giá trống sẽ lấy theo giá mua mặc định của hàng hóa.</li>
          <li>Dữ liệu hợp lệ được đưa vào phiếu đang mở và chưa tự động lưu.</li>
          <li>Khuyến nghị mỗi chứng từ không quá 200 hàng hóa.</li>
        </ul>
      </section>
      <section className="flex gap-6">
        <div className="w-44 shrink-0 pt-1">
          <p className="text-sm font-medium">Chọn tệp nhập khẩu:</p>
          <button
            type="button"
            className="mt-1 inline-flex items-center gap-1 text-sm text-[#2563eb] hover:underline disabled:opacity-60"
            disabled={isDownloading}
            onClick={() => void handleDownload()}
          >
            {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            (Tải tệp mẫu tại đây)
          </button>
        </div>
        <ImportFilePicker
          accept={ACCEPT}
          file={file}
          onFileChange={onFileChange}
          validateFile={(picked) => {
            const supported = [".xlsx", ".xls", ".csv"].some((extension) =>
              picked.name.toLowerCase().endsWith(extension),
            );
            if (!supported) toast.error("Tệp nhập khẩu phải có định dạng Excel hoặc CSV.");
            return supported;
          }}
        />
      </section>
    </div>
  );
}
