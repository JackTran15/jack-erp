import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Button, cn } from "@erp/ui";
import { Download, Paperclip, X } from "lucide-react";
import { HttpError } from "../../lib/http";
import { getDownloadUrl } from "../../lib/media/media-download.api";
import { MEDIA_OWNER_LIMITS, type MediaOwnerType } from "../../lib/media/media-limits";
import { useMediaUpload, type MediaFileState } from "../../lib/media/useMediaUpload";

export interface MediaAttachment {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
}

export interface Props {
  ownerType: MediaOwnerType;
  value: MediaAttachment[];
  onChange: (ids: string[], items: MediaAttachment[]) => void;
  readOnly?: boolean;
}

const sizeFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${sizeFormatter.format(bytes)} B`;
  if (bytes < 1024 * 1024) return `${sizeFormatter.format(bytes / 1024)} KB`;
  return `${sizeFormatter.format(bytes / (1024 * 1024))} MB`;
}

function statusLabel(f: MediaFileState): string {
  if (f.status === "uploading") return "Đang tải lên…";
  if (f.status === "error") return f.error ?? "Lỗi tải lên";
  return "Đã tải lên";
}

function downloadErrorMessage(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.error.status === 403) return "Bạn không có quyền tải tệp này.";
    if (err.error.status === 404) return "Không tìm thấy tệp, có thể đã bị xoá.";
  }
  return "Không thể tải tệp lúc này.";
}

function attachmentFor(
  f: MediaFileState,
  known: Map<string, MediaAttachment>,
): MediaAttachment | undefined {
  if (f.status !== "done" || !f.mediaId) return undefined;
  const existing = known.get(f.mediaId);
  if (existing) return existing;
  if (!f.file) return undefined;
  return { id: f.mediaId, fileName: f.fileName, contentType: f.file.type, size: f.file.size };
}

function sizeLabel(f: MediaFileState, known: Map<string, MediaAttachment>): string {
  if (f.file) return formatFileSize(f.file.size);
  const size = f.mediaId ? known.get(f.mediaId)?.size : undefined;
  return size != null ? formatFileSize(size) : "—";
}

/**
 * Shared attachment list for the 7 voucher/document dialogs (T-04-07,
 * T-04-08 wire this into each). Mount only after the owning record's detail
 * query has resolved — `useMediaUpload` (T-01-09) accepts `value` as the seed
 * for its state exactly once and ignores every later change once the list
 * has been touched.
 */
export function MediaAttachmentList({ ownerType, value, onChange, readOnly = false }: Props) {
  const valueIdsKey = value.map((item) => item.id).join(",");
  const knownById = useMemo(
    () => new Map(value.map((item) => [item.id, item])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [valueIdsKey],
  );
  const initial = useMemo(
    () => value.map((item) => ({ id: item.id, fileName: item.fileName, url: "" })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [valueIdsKey],
  );

  const { files, add, remove, retry, mediaIds } = useMediaUpload(ownerType, initial);

  const items = useMemo(
    () => files.map((f) => attachmentFor(f, knownById)).filter((a): a is MediaAttachment => !!a),
    [files, knownById],
  );

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current(mediaIds, items);
  }, [mediaIds, items]);

  const [downloadError, setDownloadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const limits = MEDIA_OWNER_LIMITS[ownerType];

  function handlePick(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      add(e.target.files);
    }
    e.target.value = "";
  }

  async function handleDownload(mediaId: string) {
    setDownloadError(null);
    try {
      const { url } = await getDownloadUrl(mediaId);
      window.location.assign(url);
    } catch (err) {
      setDownloadError(downloadErrorMessage(err));
    }
  }

  return (
    <div className="space-y-2">
      {!readOnly && (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple={limits.maxCount > 1}
            accept={limits.contentTypes.join(",")}
            className="hidden"
            onChange={handlePick}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <Paperclip className="mr-2 h-4 w-4" />
            Đính kèm tệp
          </Button>
        </>
      )}

      {downloadError && <p className="text-sm text-destructive">{downloadError}</p>}

      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có tệp đính kèm.</p>
      ) : (
        <ul className="space-y-1">
          {files.map((f) => {
            const mediaId = f.mediaId;
            return (
              <li
                key={f.localId}
                className="flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm"
              >
                <span className="flex-1 truncate">{f.fileName}</span>
                <span className="shrink-0 text-muted-foreground">{sizeLabel(f, knownById)}</span>
                <span className={cn("shrink-0", f.status === "error" && "text-destructive")}>
                  {statusLabel(f)}
                </span>
                {f.status === "error" && f.file && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => retry(f.localId)}>
                    Thử lại
                  </Button>
                )}
                {mediaId && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Tải về"
                    onClick={() => handleDownload(mediaId)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                )}
                {!readOnly && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Gỡ tệp"
                    onClick={() => remove(f.localId)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
