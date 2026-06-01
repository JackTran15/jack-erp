import { useCallback, useEffect, useRef } from "react";
import { cn } from "@erp/ui";
import { FileText } from "lucide-react";

const MISA_PRIMARY_BTN =
  "inline-flex h-9 items-center justify-center rounded bg-[#1e3a6e] px-4 text-sm font-medium text-white hover:bg-[#172e57]";

interface Props {
  accept?: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  validateFile?: (file: File) => boolean;
  className?: string;
}

export function ImportFilePicker({
  accept,
  file,
  onFileChange,
  validateFile,
  className,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file && inputRef.current) {
      inputRef.current.value = "";
    }
  }, [file]);

  const pickFile = useCallback(
    (picked: File | undefined) => {
      if (!picked) return;
      if (validateFile && !validateFile(picked)) return;
      onFileChange(picked);
    },
    [onFileChange, validateFile],
  );

  const openPicker = () => inputRef.current?.click();

  return (
    <div
      className={cn(
        "flex min-h-[200px] flex-1 flex-col items-center justify-center rounded border border-dashed border-gray-300 bg-gray-50/80 px-6 py-8",
        className,
      )}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        pickFile(e.dataTransfer.files[0]);
      }}
    >
      <FileText className="mb-3 h-12 w-12 text-gray-400" strokeWidth={1.25} />
      {file ? (
        <p className="mb-4 max-w-full truncate text-center text-sm text-foreground">
          {file.name}
        </p>
      ) : (
        <p className="mb-4 text-center text-sm text-muted-foreground">
          Kéo thả tệp Excel hoặc CSV vào đây
        </p>
      )}
      <button type="button" className={MISA_PRIMARY_BTN} onClick={openPicker}>
        Chọn tệp nguồn
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0])}
      />
    </div>
  );
}
