import { useRef, type ChangeEvent } from "react";
import { cn } from "@erp/ui";
import { CheckCircle2, FolderOpen, Loader2, X } from "lucide-react";
import { statusLabel, type QuickImageFile } from "../_lib/quick-image-files";

const ACCEPT = ".jpg,.jpeg,.png,.gif,.webp";

interface Props {
  card: QuickImageFile;
  /** Trang đang chạy Cập nhật: khoá (x) / Đổi ảnh của mọi thẻ để lượt chạy không lệch danh sách. */
  locked?: boolean;
  onRemove: (key: string) => void;
  onReplace: (key: string, file: File) => void;
}

/**
 * Một thẻ ảnh của trang Cập nhật ảnh nhanh: thumbnail (lazy), nút (x) góc trên
 * phải, nút "Đổi ảnh" đè lên đáy ảnh, tên file và dòng trạng thái. Thẻ đang tải
 * hoặc đã cập nhật không có (x) / Đổi ảnh; thẻ `done` hiện dấu tích, thẻ `failed`
 * giữ Đổi ảnh để sửa rồi chạy lại.
 */
export function QuickImageCard({ card, locked = false, onRemove, onReplace }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const label = statusLabel(card);
  const busy = card.status === "checking" || card.status === "uploading";
  const done = card.status === "done";
  const hideActions = locked || done || card.status === "uploading";

  const handleReplace = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cho phép chọn lại đúng file đó lần sau.
    event.target.value = "";
    if (file) onReplace(card.key, file);
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-md border bg-background p-2">
      <div className="relative aspect-square w-full overflow-hidden rounded bg-muted">
        <img
          src={card.previewUrl}
          alt={card.file.name}
          loading="lazy"
          className="h-full w-full object-contain"
        />
        {busy ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
          </div>
        ) : null}
        {done ? (
          <div className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5">
            <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden />
          </div>
        ) : null}
        {!hideActions ? (
          <>
            <button
              type="button"
              aria-label="Bỏ ảnh"
              onClick={() => onRemove(card.key)}
              className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow hover:bg-destructive/90"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Đổi ảnh"
              onClick={() => inputRef.current?.click()}
              className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-foreground/70 py-1.5 text-xs font-medium text-background hover:bg-foreground/80"
            >
              <FolderOpen className="h-3.5 w-3.5" aria-hidden />
              Đổi ảnh
            </button>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={handleReplace}
            />
          </>
        ) : null}
      </div>
      <p className="truncate text-sm text-foreground" title={card.file.name}>
        {card.file.name}
      </p>
      <p
        className={cn(
          "text-xs leading-snug",
          label.tone === "error" && "italic text-destructive",
          label.tone === "ok" && (done ? "font-medium text-primary" : "text-foreground"),
          label.tone === "muted" && "text-muted-foreground",
        )}
      >
        {label.text}
      </p>
    </div>
  );
}
