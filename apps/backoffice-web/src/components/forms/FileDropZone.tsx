import { useCallback, useRef, useState } from "react";
import { cn } from "@erp/ui";
import { Upload } from "lucide-react";

interface FileDropZoneProps {
  accept?: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  /** Return false to reject the file without updating state. */
  validateFile?: (file: File) => boolean;
  hint?: string;
  supportedHint?: string;
  className?: string;
}

export function FileDropZone({
  accept,
  file,
  onFileChange,
  validateFile,
  hint = "Kéo thả tệp vào đây hoặc bấm để chọn tệp",
  supportedHint,
  className,
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const pickFile = useCallback(
    (picked: File | undefined) => {
      if (!picked) return;
      if (validateFile && !validateFile(picked)) return;
      onFileChange(picked);
    },
    [onFileChange, validateFile],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors",
        dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30",
        className,
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        pickFile(e.dataTransfer.files[0]);
      }}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
    >
      <Upload className="mb-3 h-10 w-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{hint}</p>
      {supportedHint ? (
        <p className="mt-1 text-xs text-muted-foreground">{supportedHint}</p>
      ) : null}
      {file ? (
        <p className="mt-3 text-sm font-medium text-foreground">{file.name}</p>
      ) : null}
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
