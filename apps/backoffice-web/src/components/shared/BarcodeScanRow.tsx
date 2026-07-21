import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@erp/ui";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

// Hàng quét mã vạch đặt ngay trên bảng dòng (bật/tắt bằng checkbox "Quét mã vạch"
// ở detailActions). Máy quét USB gõ mã + Enter đuôi, hoặc người dùng dán/gõ tay.
// Component chỉ lo: resolve mã -> gọi onResolved để cha tự thêm/cộng dồn dòng.
export interface BarcodeScanRowProps<T> {
  /** Gọi API resolve mã (khớp SKU hoặc mã vạch) -> danh sách item khớp. */
  lookup: (code: string) => Promise<T[]>;
  /** Cha thêm dòng mới hoặc cộng dồn số lượng cho item đã có. */
  onResolved: (item: T, qty: number) => void;
  /** Trích SKU để hiển thị xác nhận sau khi resolve. */
  getSku: (item: T) => string;
  /** Trích tên hàng để hiển thị xác nhận sau khi resolve. */
  getName: (item: T) => string;
  /** Khoá ô quét khi phiếu ở trạng thái chỉ đọc. */
  disabled?: boolean;
}

const DEBOUNCE_MS = 150;

export function BarcodeScanRow<T>({
  lookup,
  onResolved,
  getSku,
  getName,
  disabled = false,
}: BarcodeScanRowProps<T>) {
  const [code, setCode] = useState("");
  const [qty, setQty] = useState(1);
  const [resolvedSku, setResolvedSku] = useState("");
  const [resolvedName, setResolvedName] = useState("");
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Chống add trùng: một lần quét (cùng mã) chỉ resolve đúng một lần dù cả
  // debounce onChange lẫn Enter cùng bắn.
  const claimRef = useRef<string | null>(null);
  // Giữ qty hiện tại cho callback resolve mà không phải đưa vào deps.
  const qtyRef = useRef(qty);
  qtyRef.current = qty;

  useEffect(() => {
    // Tự focus khi mở hàng quét để quét được ngay.
    inputRef.current?.focus();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const resolve = useCallback(
    async (raw: string) => {
      const value = raw.trim();
      if (!value || disabled) return;
      if (claimRef.current === value) return; // đã xử lý mã này rồi
      claimRef.current = value;

      setLoading(true);
      try {
        const items = await lookup(value);
        if (items.length === 1) {
          const item = items[0]!;
          onResolved(item, qtyRef.current > 0 ? qtyRef.current : 1);
          setResolvedSku(getSku(item));
          setResolvedName(getName(item));
          setCode(""); // sẵn sàng cho mã kế tiếp; giữ nguyên qty
          inputRef.current?.focus();
        } else if (items.length === 0) {
          claimRef.current = null; // cho phép quét lại
          toast.error(`Không tìm thấy hàng hoá với mã "${value}".`);
          inputRef.current?.select();
        } else {
          claimRef.current = null;
          toast.error(
            `Có ${items.length} hàng hoá khớp mã "${value}", vui lòng chọn thủ công.`,
          );
        }
      } catch {
        claimRef.current = null;
        toast.error("Không tra cứu được mã vạch, thử lại.");
      } finally {
        setLoading(false);
      }
    },
    [lookup, onResolved, getSku, getName, disabled],
  );

  const handleChange = (next: string) => {
    setCode(next);
    // Người dùng gõ/dán mã mới -> reset guard để mã này được resolve.
    if (next.trim() !== claimRef.current) claimRef.current = null;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!next.trim()) {
      setResolvedSku("");
      setResolvedName("");
      return;
    }
    debounceRef.current = setTimeout(() => void resolve(next), DEBOUNCE_MS);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    // Chặn submit form; resolve ngay (đuôi Enter của máy quét).
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void resolve(code);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
      <span className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-muted-foreground">
        {/* <ScanBarcode className="h-4 w-4" /> */}
        Quét mã vạch
      </span>
      <Input
        ref={inputRef}
        value={code}
        disabled={disabled}
        placeholder="Quét / nhập SKU hoặc mã vạch…"
        className="w-56"
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Mã vạch / SKU"
      />
      <Input
        type="number"
        min={1}
        step={1}
        value={qty}
        disabled={disabled}
        className="w-20 text-right"
        onChange={(e) => {
          const n = Number(e.target.value);
          setQty(Number.isFinite(n) && n > 0 ? Math.floor(n) : 1);
        }}
        aria-label="Số lượng"
      />
      <Input
        value={resolvedSku}
        readOnly
        tabIndex={-1}
        placeholder="Mã SKU"
        className="w-36 bg-muted"
        aria-label="Mã SKU đã tra"
      />
      <Input
        value={resolvedName}
        readOnly
        tabIndex={-1}
        placeholder="Tên hàng hoá"
        className="min-w-[12rem] flex-1 bg-muted"
        aria-label="Tên hàng đã tra"
      />
      {loading && (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
