import { useEffect, useMemo, useRef, useState } from "react";
import { HttpError } from "../http";
import { completeUpload, createUpload, uploadToStorage, UploadFailedError } from "./media-upload.api";
import { MEDIA_OWNER_LIMITS, validateFileAgainstLimits, type MediaOwnerType } from "./media-limits";

export interface InitialMediaItem {
  id: string;
  url: string;
  fileName: string;
}

export interface MediaFileState {
  localId: string;
  /**
   * The browser `File` this entry came from, kept for display/preview only.
   * Absent for entries seeded from `initial` and for files rejected
   * client-side (wrong type/size/empty, or over the owner's file-count
   * limit) — those never reach the server. Whether `retry` can actually act
   * on a given entry is tracked separately (see `retryableRef` in the hook).
   */
  file?: File;
  previewUrl?: string;
  fileName: string;
  status: "uploading" | "done" | "error";
  mediaId?: string;
  error?: string;
}

export interface UseMediaUploadResult {
  files: MediaFileState[];
  add: (files: FileList | File[]) => void;
  remove: (localId: string) => void;
  retry: (localId: string) => void;
  mediaIds: string[];
  isUploading: boolean;
}

const FALLBACK_ERROR_MESSAGE = "Không thể tải tệp lên lúc này.";

function messageForError(err: unknown): string {
  if (err instanceof UploadFailedError) {
    return FALLBACK_ERROR_MESSAGE;
  }
  if (err instanceof HttpError) {
    if (err.error.status === 403) {
      return "Bạn không có quyền tải tệp lên cho mục này.";
    }
    switch (err.error.code) {
      case "STORAGE_UNAVAILABLE":
        return FALLBACK_ERROR_MESSAGE;
      case "MEDIA_QUOTA_EXCEEDED":
        return "Có quá nhiều tệp tải lên chưa được lưu, hãy lưu biểu mẫu rồi thử lại.";
      case "MEDIA_TOO_LARGE":
        return "Tệp vượt quá dung lượng cho phép.";
      case "MEDIA_TYPE_NOT_ALLOWED":
        return "Loại tệp không được hỗ trợ.";
      case "MEDIA_INVALID":
        return "Tệp tải lên không hợp lệ, vui lòng thử lại.";
      case "HTTP_400":
        return "Tệp tải lên không hợp lệ.";
      default:
        return FALLBACK_ERROR_MESSAGE;
    }
  }
  return FALLBACK_ERROR_MESSAGE;
}

function revokeIfBlob(previewUrl: string | undefined): void {
  if (previewUrl?.startsWith("blob:")) {
    URL.revokeObjectURL(previewUrl);
  }
}

function seedFromInitial(initial: InitialMediaItem[] | undefined): MediaFileState[] {
  return (initial ?? []).map((item) => ({
    localId: crypto.randomUUID(),
    fileName: item.fileName,
    previewUrl: item.url,
    status: "done" as const,
    mediaId: item.id,
  }));
}

/**
 * Shared upload state for one owner's media (product/item images, employee
 * photo, voucher attachments — 03-logical-design.md, State ownership).
 *
 * Re-seeding: `initial` commonly arrives after mount (edit forms fetch the
 * record, then pass its media down), so it is not just read once. Whenever
 * the set of `initial` ids or `ownerType` changes, the hook replaces `files`
 * with a fresh seed from `initial` — but only if the user has not touched
 * anything locally yet (no entry currently has a `file`, and no seeded entry
 * has been removed). Client-rejected entries (wrong type/size/empty, or over
 * the count limit) never have `file` either, so they don't count as
 * "touched" and are silently dropped along with everything else if a
 * re-seed happens while one is showing. This avoids clobbering in-progress
 * edits once the user has started adding or removing files. An `ownerType`
 * change is treated as a harder reset: it always re-seeds, aborting any
 * in-flight uploads and dropping locally added entries, since it means the
 * hook now manages a different owner's media entirely.
 *
 * Once the list has been touched, every later `initial` update is ignored
 * for good — the touched check re-runs on each change but keeps finding the
 * list touched and bailing. Callers must not render the uploader, or call
 * `add()`, before `initial` has loaded — e.g. gate mounting on the owning
 * record's query having succeeded.
 */
export function useMediaUpload(
  ownerType: MediaOwnerType,
  initial?: InitialMediaItem[],
): UseMediaUploadResult {
  const [files, setFiles] = useState<MediaFileState[]>(() => seedFromInitial(initial));

  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const controllersRef = useRef(new Map<string, AbortController>());
  // Idempotent set instead of a counter: `remove`/`retry` read `files` from the
  // last render, so a plain increment/decrement can drift under races (a
  // remove landing between a failed upload's decrement and its render, or a
  // double retry). Adding/deleting a localId is safe to repeat.
  const acceptedIdsRef = useRef(new Set(files.map((f) => f.localId)));
  // Source of truth for "can this entry be retried", independent of the
  // `files` state a handler closed over: a failed upload's file goes in, a
  // successful retry or a `remove` takes it back out. Reading this instead of
  // `files.find(...)` keeps `retry` correct even if it runs after a `remove`
  // of the same id, or after a re-seed, in the same tick.
  const retryableRef = useRef(new Map<string, File>());
  const seededLocalIdsRef = useRef(new Set(files.map((f) => f.localId)));
  const removedInitialRef = useRef(false);

  const initialKey = (initial ?? []).map((item) => item.id).join(",");
  const prevInitialKeyRef = useRef(initialKey);
  const prevOwnerTypeRef = useRef(ownerType);

  useEffect(() => {
    const ownerChanged = prevOwnerTypeRef.current !== ownerType;
    const initialChanged = prevInitialKeyRef.current !== initialKey;
    prevOwnerTypeRef.current = ownerType;
    prevInitialKeyRef.current = initialKey;

    if (!ownerChanged && !initialChanged) return;

    const touched = filesRef.current.some((f) => f.file) || removedInitialRef.current;
    if (!ownerChanged && touched) return;

    for (const controller of controllersRef.current.values()) {
      controller.abort();
    }
    controllersRef.current.clear();

    for (const f of filesRef.current) {
      revokeIfBlob(f.previewUrl);
    }

    const seeded = seedFromInitial(initial);
    seededLocalIdsRef.current = new Set(seeded.map((f) => f.localId));
    acceptedIdsRef.current = new Set(seeded.map((f) => f.localId));
    retryableRef.current.clear();
    removedInitialRef.current = false;
    setFiles(seeded);
    // `initial` itself is excluded on purpose: callers commonly pass a new
    // array reference every render, and `initialKey` (its joined ids) is
    // already the real change signal this effect reacts to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey, ownerType]);

  useEffect(() => {
    return () => {
      for (const controller of controllersRef.current.values()) {
        controller.abort();
      }
      for (const f of filesRef.current) {
        revokeIfBlob(f.previewUrl);
      }
    };
  }, []);

  async function runUpload(localId: string, file: File): Promise<void> {
    const controller = new AbortController();
    controllersRef.current.set(localId, controller);
    try {
      const ticket = await createUpload({
        ownerType,
        fileName: file.name,
        contentType: file.type,
        size: file.size,
      });
      if (controller.signal.aborted) return;

      await uploadToStorage(ticket.upload, file, controller.signal);
      if (controller.signal.aborted) return;

      const completed = await completeUpload(ticket.mediaId);
      if (controller.signal.aborted) return;

      setFiles((prev) =>
        prev.map((f) =>
          f.localId === localId ? { ...f, status: "done", mediaId: completed.mediaId } : f,
        ),
      );
    } catch (err) {
      if (controller.signal.aborted) return;
      console.warn("media upload failed", err);
      acceptedIdsRef.current.delete(localId);
      retryableRef.current.set(localId, file);
      setFiles((prev) =>
        prev.map((f) =>
          f.localId === localId ? { ...f, status: "error", error: messageForError(err) } : f,
        ),
      );
    } finally {
      // Guards against a double-retry race: the second runUpload's controller
      // would otherwise have its entry deleted by the first one's cleanup.
      if (controllersRef.current.get(localId) === controller) {
        controllersRef.current.delete(localId);
      }
    }
  }

  function add(input: FileList | File[]): void {
    const incoming = Array.from(input);
    if (incoming.length === 0) return;

    const limits = MEDIA_OWNER_LIMITS[ownerType];

    const additions: MediaFileState[] = incoming.map((file) => {
      const localId = crypto.randomUUID();

      const limitError = validateFileAgainstLimits(ownerType, file);
      if (limitError) {
        return { localId, fileName: file.name, status: "error", error: limitError };
      }

      if (acceptedIdsRef.current.size >= limits.maxCount) {
        return {
          localId,
          fileName: file.name,
          status: "error",
          error: `Đã đạt số lượng tệp tối đa (${limits.maxCount}).`,
        };
      }

      acceptedIdsRef.current.add(localId);
      return {
        localId,
        file,
        fileName: file.name,
        previewUrl: URL.createObjectURL(file),
        status: "uploading",
      };
    });

    setFiles((prev) => [...prev, ...additions]);

    for (const entry of additions) {
      if (entry.status === "uploading" && entry.file) {
        void runUpload(entry.localId, entry.file);
      }
    }
  }

  function remove(localId: string): void {
    controllersRef.current.get(localId)?.abort();
    controllersRef.current.delete(localId);
    acceptedIdsRef.current.delete(localId);
    retryableRef.current.delete(localId);

    const target = files.find((f) => f.localId === localId);
    if (!target) return;

    if (seededLocalIdsRef.current.has(localId)) {
      removedInitialRef.current = true;
    }
    revokeIfBlob(target.previewUrl);

    setFiles((prev) => prev.filter((f) => f.localId !== localId));
  }

  function retry(localId: string): void {
    const file = retryableRef.current.get(localId);
    if (!file) return;

    const limits = MEDIA_OWNER_LIMITS[ownerType];
    if (acceptedIdsRef.current.size >= limits.maxCount) {
      setFiles((prev) =>
        prev.map((f) =>
          f.localId === localId
            ? { ...f, error: `Đã đạt số lượng tệp tối đa (${limits.maxCount}).` }
            : f,
        ),
      );
      return;
    }

    retryableRef.current.delete(localId);
    acceptedIdsRef.current.add(localId);
    setFiles((prev) =>
      prev.map((f) => (f.localId === localId ? { ...f, status: "uploading", error: undefined } : f)),
    );
    void runUpload(localId, file);
  }

  const mediaIds = useMemo(
    () =>
      files
        .filter((f): f is MediaFileState & { mediaId: string } => f.status === "done" && !!f.mediaId)
        .map((f) => f.mediaId),
    [files],
  );

  const isUploading = files.some((f) => f.status === "uploading");

  return { files, add, remove, retry, mediaIds, isUploading };
}
