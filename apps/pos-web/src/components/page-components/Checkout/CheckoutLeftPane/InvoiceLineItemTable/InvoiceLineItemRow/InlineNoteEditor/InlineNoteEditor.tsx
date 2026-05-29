import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useCheckoutSessionCart } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-session-cart";
import { usePosCheckoutUiStore } from "@erp/pos/stores/page-stores/checkout/checkout-ui.store";

export interface InlineNoteEditorProps {
  lineId: string;
  initial: string;
}

/**
 * Textarea inline cho ghi chú dòng. Enter (không Shift) = lưu + đóng; Esc = huỷ
 * không lưu; blur = lưu + đóng (UX nhập nhanh). Auto-focus khi mount.
 */
export function InlineNoteEditor({ lineId, initial }: InlineNoteEditorProps) {
  const { updateLineNote } = useCheckoutSessionCart();
  const stopEditLineNote = usePosCheckoutUiStore((s) => s.stopEditLineNote);

  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  const handleSave = () => {
    if (cancelledRef.current) return;
    updateLineNote(lineId, value);
    stopEditLineNote();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cancelledRef.current = true;
      stopEditLineNote();
    }
  };

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleSave}
      onClick={(e) => e.stopPropagation()}
      placeholder="Ghi chú cho dòng này…"
      rows={1}
      aria-label="Ghi chú dòng"
      className="w-full resize-none rounded border border-[#E2E5EA] bg-white px-2 py-1 text-[12px] italic text-gray-700 placeholder:text-gray-400 focus:border-[#5C6BC0] focus:outline-none"
    />
  );
}
