import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Button } from "@erp/ui";
import { FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  GOODS_IMAGE_COUNT_MESSAGE,
  uploadGoodsImages,
} from "../../../lib/media/upload-goods-images";
import { reasonMessage, setItemImages } from "../_lib/set-item-images.api";

const MAX_IMAGES = 10;
const ACCEPT = ".jpg,.jpeg,.png,.gif,.webp";

export interface RowImageUploadDone {
  /** Object URL của ảnh đầu tiên vừa chọn — xem trước tại chỗ tới khi refetch. */
  thumbnailUrl: string | null;
  imageCount: number;
}

interface Props {
  row: { type: "product" | "orphan"; id: string; code: string };
  onDone: (result: RowImageUploadDone) => void;
}

/**
 * Nút "Tải ảnh" của một dòng: chọn ≤ 10 ảnh → `uploadGoodsImages` (owner
 * PRODUCT cho mẫu mã, ITEM cho hàng lẻ) → `set-images` một assignment.
 * Bất kỳ file lỗi ⇒ không gọi `set-images` để bộ ảnh cũ giữ nguyên (ADR-04).
 */
export function RowImageUploadButton({ row, onDone }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Cho phép chọn lại đúng bộ file đó lần sau.
    event.target.value = "";
    if (files.length === 0) return;
    if (files.length > MAX_IMAGES) {
      toast.error(GOODS_IMAGE_COUNT_MESSAGE);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    try {
      const uploaded = await uploadGoodsImages(
        row.type === "product" ? "PRODUCT" : "ITEM",
        files,
        { signal: controller.signal },
      );
      const firstError = uploaded.find((u) => u.error !== undefined);
      if (firstError) {
        toast.error(`${firstError.error} (${firstError.file.name})`);
        return;
      }
      const imageIds = uploaded.map((u) => u.mediaId as string);

      const result = await setItemImages([{ id: row.id, imageIds }]);
      if (controller.signal.aborted) return;
      const failed = result.failed[0];
      if (failed) {
        toast.error(reasonMessage(failed.reason));
        return;
      }
      const updated = result.updated[0];
      if (!updated) {
        toast.error(reasonMessage("UNKNOWN"));
        return;
      }
      toast.success(`Đã cập nhật ${updated.imageCount} ảnh cho ${row.code}`);
      onDone({
        thumbnailUrl: URL.createObjectURL(files[0]),
        imageCount: updated.imageCount,
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      console.warn("set-images failed", err);
      toast.error(reasonMessage("UNKNOWN"));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => void handleChange(e)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <FolderOpen className="mr-1.5 h-4 w-4" aria-hidden />
        )}
        {busy ? "Đang tải…" : "Tải ảnh"}
      </Button>
    </>
  );
}
