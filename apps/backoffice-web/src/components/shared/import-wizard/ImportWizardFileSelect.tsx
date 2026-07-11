import {
  INVENTORY_IMPORT_PREVIEW_ROWS_LIMIT,
  ImportDuplicateMode,
} from "@erp/shared-interfaces";
import { RadioGroup } from "../../forms/RadioGroup";
import { ImportFilePicker } from "./ImportFilePicker";
import {
  DUPLICATE_MODE_OPTIONS,
  IMPORT_FILE_ACCEPT,
  isSupportedImportFile,
} from "./import-file-utils";

interface Props {
  /** Heading above the intro bullet list. */
  introTitle: string;
  introBullets: string[];
  /** Noun in "Khi gặp <noun> đã tồn tại:" (e.g. "hàng hóa", "khách hàng"). */
  duplicateNoun: string;
  onDownloadTemplate: () => Promise<void>;
  duplicateMode: ImportDuplicateMode;
  onDuplicateModeChange: (mode: ImportDuplicateMode) => void;
  file: File | null;
  onFileChange: (file: File | null) => void;
}

/** Generic step-1 of the import wizard (file + duplicate-mode selection). */
export function ImportWizardFileSelect({
  introTitle,
  introBullets,
  duplicateNoun,
  onDownloadTemplate,
  duplicateMode,
  onDuplicateModeChange,
  file,
  onFileChange,
}: Props) {
  const bullets = [
    ...introBullets,
    `File lớn được xử lý theo lô trên máy chủ; bước kiểm tra hiển thị tối đa ${INVENTORY_IMPORT_PREVIEW_ROWS_LIMIT} dòng mẫu.`,
  ];

  return (
    <div className="flex flex-col gap-5">
      <section>
        <p className="text-sm font-medium text-foreground">{introTitle}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {bullets.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>

      <section>
        <p className="text-sm font-medium text-foreground">
          Khi gặp {duplicateNoun} đã tồn tại:
        </p>
        <RadioGroup
          name="import-wizard-duplicate-mode"
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
            onClick={() => void onDownloadTemplate().catch(() => undefined)}
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
