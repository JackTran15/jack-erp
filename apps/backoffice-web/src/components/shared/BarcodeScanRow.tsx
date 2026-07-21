import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@erp/ui";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

// Barcode-scan row sitting right above the line grid (toggled by the "Quét mã vạch"
// checkbox in detailActions). A USB scanner types the code with a trailing Enter, or the
// user pastes/types it by hand. Its only job: resolve the code -> call onResolved so the
// parent adds or accumulates the line.
export interface BarcodeScanRowProps<T> {
  /** Calls the API to resolve a code (SKU or barcode match) -> list of matching items. */
  lookup: (code: string) => Promise<T[]>;
  /** Parent adds a new line or accumulates the quantity for an existing item. */
  onResolved: (item: T, qty: number) => void;
  /** Extracts the SKU to show as confirmation after resolving. */
  getSku: (item: T) => string;
  /** Extracts the item name to show as confirmation after resolving. */
  getName: (item: T) => string;
  /** Locks the scan input when the document is read-only. */
  disabled?: boolean;
  /** Hides the quantity input (for forms with no quantity concept, e.g. Xếp vị trí). */
  showQty?: boolean;
}

const DEBOUNCE_MS = 150;

export function BarcodeScanRow<T>({
  lookup,
  onResolved,
  getSku,
  getName,
  disabled = false,
  showQty = true,
}: BarcodeScanRowProps<T>) {
  const [code, setCode] = useState("");
  const [qty, setQty] = useState(1);
  const [resolvedSku, setResolvedSku] = useState("");
  const [resolvedName, setResolvedName] = useState("");
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Prevents duplicate adds: a single scan (same code) resolves exactly once even when
  // both the onChange debounce and Enter fire together.
  const claimRef = useRef<string | null>(null);
  // Holds the current qty for the resolve callback without putting it in deps.
  const qtyRef = useRef(qty);
  qtyRef.current = qty;

  useEffect(() => {
    // Auto-focus when the scan row opens so scanning works right away.
    inputRef.current?.focus();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const resolve = useCallback(
    async (raw: string) => {
      const value = raw.trim();
      if (!value || disabled) return;
      if (claimRef.current === value) return; // this code was already handled
      claimRef.current = value;

      setLoading(true);
      try {
        const items = await lookup(value);
        if (items.length === 1) {
          const item = items[0]!;
          onResolved(item, qtyRef.current > 0 ? qtyRef.current : 1);
          setResolvedSku(getSku(item));
          setResolvedName(getName(item));
          claimRef.current = null;
          setCode(""); // clear for the next code; keep qty
          inputRef.current?.focus();
        } else if (items.length === 0) {
          claimRef.current = null; // allow re-scanning
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
    // User types/pastes a new code -> reset the guard so this code can resolve.
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
    // Prevent form submit; resolve immediately (the scanner's trailing Enter).
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
      {showQty && (
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
      )}
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
