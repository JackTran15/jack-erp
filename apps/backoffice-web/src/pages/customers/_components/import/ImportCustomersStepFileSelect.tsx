import {
  INVENTORY_IMPORT_PREVIEW_ROWS_LIMIT,
  ImportDuplicateMode,
} from "@erp/shared-interfaces";
import { RadioGroup } from "../../../../components/forms/RadioGroup";
import { ImportFilePicker } from "../../../inventory/_components/import/ImportFilePicker";
import {
  DUPLICATE_MODE_OPTIONS,
  IMPORT_FILE_ACCEPT,
  isSupportedImportFile,
} from "../../../inventory/_components/import/import-file-utils";
import { downloadCustomersTemplate } from "./import-customers.api";

interface Props {
  duplicateMode: ImportDuplicateMode;
  onDuplicateModeChange: (mode: ImportDuplicateMode) => void;
  file: File | null;
  onFileChange: (file: File | null) => void;
}

const INTRO_BULLETS = [
  "Nhập khẩu danh mục khách hàng từ phần mềm khác (MISA, Excel, CSV…).",
  "Hỗ trợ nhóm khách hàng, thẻ thành viên và nhân viên phụ trách.",
  "Chọn Cập nhật hoặc Bỏ qua khi mã khách hàng đã tồn tại trong hệ thống.",
  "Tải tệp mẫu, điền dữ liệu từ dòng 5 trên sheet «Danh sách khách hàng».",
  `File lớn được xử lý theo lô trên máy chủ; bước kiểm tra hiển thị tối đa ${INVENTORY_IMPORT_PREVIEW_ROWS_LIMIT} dòng mẫu.`,
];

export function ImportCustomersStepFileSelect({
  duplicateMode,
  onDuplicateModeChange,
  file,
  onFileChange,
}: Props) {
  return (
    <div className="flex flex-col gap-5">
      <section>
        <p className="text-sm font-medium text-foreground">
          Nhập khẩu khách hàng đáp ứng nhu cầu:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {INTRO_BULLETS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section>
        <p className="text-sm font-medium text-foreground">
          Khi gặp khách hàng đã tồn tại:
        </p>
        <RadioGroup
          name="import-customers-duplicate-mode"
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
              void downloadCustomersTemplate().catch(() => undefined)
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
