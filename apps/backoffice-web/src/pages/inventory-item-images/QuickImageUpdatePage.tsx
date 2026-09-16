import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@erp/ui";
import { ArrowLeft, FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { QuickImageCard } from "./_components/QuickImageCard";
import {
  countDone,
  countUpdatable,
  localErrorFor,
  markDuplicateSeq,
  type QuickImageFile,
} from "./_lib/quick-image-files";
import {
  resolveImageNames,
  type ResolvedImageName,
} from "./_lib/resolve-image-names.api";
import { runQuickImageUpdate } from "./_lib/run-quick-image-update";

const ACCEPT = ".jpg,.jpeg,.png,.gif,.webp";
const RESOLVE_FAILED_MESSAGE = "Không kiểm tra được tên file, thử lại";
const BACK_PATH = "/admin/inventory-items";

function newCard(file: File): QuickImageFile {
  const localError = localErrorFor(file);
  return {
    key: crypto.randomUUID(),
    file,
    previewUrl: URL.createObjectURL(file),
    localError,
    resolved: null,
    status: localError === null ? "checking" : "pending",
  };
}

/**
 * Trang "Cập nhật ảnh nhanh" (Danh mục > Hàng hoá > Tiện ích): thả file đặt tên
 * theo mã SKU, server tách và khớp tên (`resolve-image-names`, ADR-03), mỗi thẻ
 * hiện kết quả; bộ đếm "Cập nhật k/N ảnh". Bấm Cập nhật ⇒ tải lên và gắn theo
 * từng owner (`runQuickImageUpdate`, ADR-04); đang chạy thì chặn rời trang (AC-17).
 */
export function QuickImageUpdatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [cards, setCards] = useState<QuickImageFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);

  // Revoke mọi object URL còn lại khi rời trang.
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      for (const card of cardsRef.current) URL.revokeObjectURL(card.previewUrl);
    };
  }, []);

  // AC-17: đóng tab / reload khi đang tải ⇒ trình duyệt hỏi xác nhận.
  useEffect(() => {
    if (!running) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [running]);

  /** Gọi resolve cho các thẻ `checking`, gắn kết quả theo key rồi đánh trùng STT trên toàn danh sách. */
  const resolveCards = async (targets: QuickImageFile[]) => {
    if (targets.length === 0) return;
    const keys = targets.map((c) => c.key);
    try {
      const results = await resolveImageNames(targets.map((c) => c.file.name));
      const byKey = new Map<string, ResolvedImageName>();
      results.forEach((r, i) => byKey.set(keys[i], r));
      setCards((prev) =>
        markDuplicateSeq(
          prev.map((c) => {
            const resolved = byKey.get(c.key);
            return resolved && c.status === "checking"
              ? { ...c, resolved, status: "pending", error: undefined }
              : c;
          }),
        ),
      );
    } catch (err) {
      console.warn("resolve image names failed", err);
      toast.error(RESOLVE_FAILED_MESSAGE);
      const keySet = new Set(keys);
      setCards((prev) =>
        prev.map((c) =>
          keySet.has(c.key) && c.status === "checking"
            ? { ...c, status: "failed", error: RESOLVE_FAILED_MESSAGE }
            : c,
        ),
      );
    }
  };

  const addFiles = (files: File[]) => {
    if (files.length === 0) return;
    const added = files.map(newCard);
    setCards((prev) => markDuplicateSeq([...prev, ...added]));
    void resolveCards(added.filter((c) => c.status === "checking"));
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Cho phép chọn lại đúng bộ file đó lần sau.
    event.target.value = "";
    addFiles(files);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!dragging) setDragging(true);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    addFiles(Array.from(event.dataTransfer.files));
  };

  const handleRemove = (key: string) => {
    const card = cards.find((c) => c.key === key);
    if (card) URL.revokeObjectURL(card.previewUrl);
    setCards((prev) => markDuplicateSeq(prev.filter((c) => c.key !== key)));
  };

  const handleReplace = (key: string, file: File) => {
    const old = cards.find((c) => c.key === key);
    if (!old) return;
    URL.revokeObjectURL(old.previewUrl);
    const replaced: QuickImageFile = { ...newCard(file), key };
    setCards((prev) =>
      markDuplicateSeq(prev.map((c) => (c.key === key ? replaced : c))),
    );
    if (replaced.status === "checking") void resolveCards([replaced]);
  };

  const handleUpdate = async () => {
    if (running) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    const doneBefore = countDone(cards);
    try {
      const result = await runQuickImageUpdate(cards, {
        signal: controller.signal,
        onCardStatus: (key, status, error) =>
          setCards((prev) =>
            prev.map((c) => (c.key === key ? { ...c, status, error } : c)),
          ),
        onOwnerDone: () => {},
      });
      if (controller.signal.aborted) return;
      const message = `Đã cập nhật ${doneBefore + result.done}/${cardsRef.current.length} ảnh`;
      if (result.failed > 0) toast.warning(message);
      else toast.success(message);
      void queryClient.invalidateQueries({ queryKey: ["product-images"] });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(false);
    }
  };

  const handleBack = () => {
    if (running) setLeaveDialogOpen(true);
    else navigate(BACK_PATH);
  };

  const handleLeave = () => {
    abortRef.current?.abort();
    setLeaveDialogOpen(false);
    navigate(BACK_PATH);
  };

  const total = cards.length;
  const done = countDone(cards);
  const updatable = countUpdatable(cards);
  const k = done > 0 ? done : updatable;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-2.5 overflow-hidden">
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-background">
        <header className="border-b px-4 py-3">
          <h1 className="text-base font-bold text-foreground">
            Cập nhật <strong>{k}</strong>/{total} ảnh{" "}
            <span className="text-sm font-normal italic text-muted-foreground">
              (Chỉ hỗ trợ định dạng ảnh (.jpg, .jpeg, .png, .gif, .webp) và dung lượng &lt; 2MB)
            </span>
          </h1>
        </header>

        <div className="border-b bg-muted/40 px-4 py-3 text-sm text-foreground">
          <p className="font-medium">Lưu ý:</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5">
            <li>
              Với mẫu mã: <code>Tên ảnh = Mã SKU (STT)</code>, STT từ 01 đến 10, ví dụ{" "}
              <code>AOSOMI (01)</code>.
            </li>
            <li>
              Với hàng lẻ hoặc biến thể: <code>Tên ảnh = Mã SKU</code>; file đặt theo mã biến thể
              được gắn vào mẫu mã của biến thể đó.
            </li>
            <li>Chương trình ghi đè toàn bộ ảnh đang có của mẫu mã / hàng hóa.</li>
          </ol>
        </div>

        <div
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4"
          onDragOver={handleDragOver}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <div
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 text-center text-sm text-muted-foreground",
              total === 0 ? "min-h-[200px] py-10" : "py-4",
              dragging ? "border-primary bg-accent" : "border-border",
            )}
          >
            <p>Kéo thả ảnh vào đây hoặc bấm Chọn ảnh</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
            >
              <FolderOpen className="mr-1.5 h-4 w-4" aria-hidden />
              Chọn ảnh
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={handleInputChange}
            />
          </div>

          {total > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {cards.map((card) => (
                <QuickImageCard
                  key={card.key}
                  card={card}
                  locked={running}
                  onRemove={handleRemove}
                  onReplace={handleReplace}
                />
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={handleBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
          Quay lại
        </Button>
        <Button
          type="button"
          disabled={running || updatable === 0}
          onClick={() => void handleUpdate()}
        >
          {running ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
              Đang cập nhật…
            </>
          ) : (
            "Cập nhật"
          )}
        </Button>
      </div>

      {leaveDialogOpen ? (
        <Dialog open onOpenChange={(open) => !open && setLeaveDialogOpen(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Đang tải ảnh</DialogTitle>
              <DialogDescription>
                Đang tải ảnh, rời trang sẽ dừng các file chưa xong?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLeaveDialogOpen(false)}>
                Huỷ
              </Button>
              <Button variant="destructive" onClick={handleLeave}>
                Rời trang
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
