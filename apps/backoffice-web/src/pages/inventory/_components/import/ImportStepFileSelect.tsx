import {
  ImportDuplicateMode,
  IMPORT_DUPLICATE_MODE_LABELS,
  INVENTORY_IMPORT_PREVIEW_ROWS_LIMIT,
} from "@erp/shared-interfaces";
import { downloadInventoryTemplate } from "./import-inventory.api";
import { ImportFilePicker } from "./ImportFilePicker";
import { RadioGroup } from "../../../../components/forms/RadioGroup";

interface Props {
  duplicateMode: ImportDuplicateMode;
  onDuplicateModeChange: (mode: ImportDuplicateMode) => void;
  file: File | null;
  onFileChange: (file: File | null) => void;
}

const IMPORT_FILE_ACCEPT =
  ".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv";

const DUPLICATE_MODE_OPTIONS = (
  Object.values(ImportDuplicateMode) as ImportDuplicateMode[]
).map((value) => ({
  value,
  label: IMPORT_DUPLICATE_MODE_LABELS[value],
}));

const INTRO_BULLETS = [
  "Nhập khẩu hàng hóa từ phần mềm khác (MISA, Excel, CSV…).",
  "Hỗ trợ bảng giá, đơn vị chuyển đổi, kích thước và trọng lượng.",
  "Cập nhật vị trí lưu kho, trưng bày và thông tin bán hàng.",
  "Chọn Cập nhật hoặc Bỏ qua khi mã SKU đã tồn tại trong hệ thống.",
  "Tải tệp mẫu, điền dữ liệu từ dòng 5 trên sheet «Danh sách hàng hóa».",
  `File lớn được xử lý theo lô trên máy chủ; bước kiểm tra hiển thị tối đa ${INVENTORY_IMPORT_PREVIEW_ROWS_LIMIT} dòng mẫu.`,
];

function isSupportedImportFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  const supportedExtensions = [".xlsx", ".xls", ".csv"];
  return supportedExtensions.some((ext) => lower.endsWith(ext));
}

export function ImportStepFileSelect({
  duplicateMode,
  onDuplicateModeChange,
  file,
  onFileChange,
}: Props) {
  return (
    <div className="flex flex-col gap-5">
      <section>
        <p className="text-sm font-medium text-foreground">
          Cải tiến nhập khẩu hàng hóa đáp ứng nhu cầu:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {INTRO_BULLETS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section>
        <p className="text-sm font-medium text-foreground">
          Khi gặp hàng hóa đã tồn tại:
        </p>
        <RadioGroup
          name="import-duplicate-mode"
          value={duplicateMode}
          onChange={onDuplicateModeChange}
          options={DUPLICATE_MODE_OPTIONS}
          className="gap-6"
        />
      </section>

      <section className="flex gap-6">
        <div className="w-44 shrink-0 pt-1">
          <p className="text-sm font-medium text-foreground">
            Chọn tệp nhập khẩu:
          </p>
          <button
            type="button"
            className="mt-1 text-left text-sm text-[#2563eb] hover:underline"
            onClick={() =>
              void downloadInventoryTemplate().catch(() => undefined)
            }
          >
            (Tải tệp mẫu tại đây)
          </button>
        </div>
        <ImportFilePicker
          accept={IMPORT_FILE_ACCEPT}
          file={file}
          onFileChange={onFileChange}
          validateFile={isSupportedImportFile}
        />
      </section>
    </div>
  );
}
