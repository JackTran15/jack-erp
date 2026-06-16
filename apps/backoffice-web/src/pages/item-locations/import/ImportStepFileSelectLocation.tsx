import { ImportDuplicateMode } from "@erp/shared-interfaces";
import { toast } from "sonner";
import { RadioGroup } from "../../../components/forms/RadioGroup";
import { ImportFilePicker } from "../../inventory/_components/import/ImportFilePicker";
import {
  DUPLICATE_MODE_OPTIONS,
  IMPORT_FILE_ACCEPT,
  isSupportedImportFile,
} from "../../inventory/_components/import/import-file-utils";
import { downloadLocationTemplate } from "./import-location.api";

interface Props {
  duplicateMode: ImportDuplicateMode;
  onDuplicateModeChange: (mode: ImportDuplicateMode) => void;
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export function ImportStepFileSelectLocation({
  duplicateMode,
  onDuplicateModeChange,
  file,
  onFileChange,
}: Props) {
  return (
    <div className="flex flex-col gap-5">
      <section>
        <p className="text-sm font-medium text-foreground">
          Khi gặp vị trí đã tồn tại:
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
            onClick={async () => {
              try {
                await downloadLocationTemplate();
                toast.success("Đã tải tệp mẫu");
              } catch {
                toast.error("Tải file mẫu thất bại. Vui lòng thử lại.");
              }
            }}
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
