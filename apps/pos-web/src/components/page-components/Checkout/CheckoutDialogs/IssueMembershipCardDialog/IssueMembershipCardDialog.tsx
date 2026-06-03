import { useCallback, useMemo, useRef, useState } from "react";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { PosSearchPopover, type SearchSuggestion } from "@erp/pos/components/common/PosSearchPopover/PosSearchPopover";
import { useMembershipCardTypes } from "@erp/pos/hooks/react-query/use-query-customer";
import type { MembershipCardType } from "@erp/pos/interfaces/membership-card-type.interface";

export interface IssueMembershipCardDialogProps {
  open: boolean;
  onClose: () => void;
  /** Tên khách hàng hiển thị (read-only). */
  customerName: string;
  /** Số điện thoại khách hàng (read-only). */
  customerPhone?: string | null;
  /**
   * Hạng thẻ hiện tại — chỉ hiện "Hạng thẻ cũ" khi có giá trị.
   * Truyền `null` / `undefined` khi khách chưa có thẻ.
   */
  currentTierLabel?: string | null;
  /** Gọi khi user xác nhận, truyền tier được chọn. */
  onConfirm: (tier: string) => void;
  /** `true` khi đang gọi API. */
  submitting?: boolean;
}

const TIER_DOT_COLOR: Record<string, string> = {
  none: "bg-gray-300",
  silver: "bg-slate-400",
  gold: "bg-amber-400",
  diamond: "bg-cyan-400",
};

const ROW_CLS =
  "grid grid-cols-[140px_1fr] items-center gap-4 border-b border-dashed border-gray-200 py-3";
const LABEL_CLS = "text-[13px] text-gray-600";
const VALUE_CLS = "text-[13px] text-gray-400";

function TierDot({ tier }: { tier: string }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${TIER_DOT_COLOR[tier] ?? "bg-gray-300"}`}
    />
  );
}

export function IssueMembershipCardDialog({
  open,
  onClose,
  customerName,
  customerPhone,
  currentTierLabel,
  onConfirm,
  submitting = false,
}: IssueMembershipCardDialogProps) {
  const [selectedType, setSelectedType] = useState<MembershipCardType | null>(null);
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: cardTypes = [] } = useMembershipCardTypes();

  const search = useCallback(
    async (q: string): Promise<SearchSuggestion<MembershipCardType>[]> => {
      const lower = q.toLowerCase();
      return cardTypes
        .filter((t) => !lower || t.name.toLowerCase().includes(lower))
        .map((t) => ({ item: t }));
    },
    [cardTypes],
  );

  const isChangeMode = Boolean(currentTierLabel);
  const title = isChangeMode ? "Đổi thẻ" : "Cấp thẻ";

  const handleSelect = (ct: MembershipCardType) => {
    setSelectedType(ct);
    setQuery(ct.name);
  };

  const handleConfirm = () => {
    if (!selectedType) return;
    onConfirm(selectedType.tier);
  };

  return (
    <PosDialog open={open} onClose={onClose} width={560} initialFocusRef={inputRef}>
      <PosDialog.Header title={title} />
      <PosDialog.Body className="py-2">
        <div className="px-1">
          {/* Khách hàng */}
          <div className={ROW_CLS}>
            <span className={LABEL_CLS}>Khách hàng</span>
            <span className={VALUE_CLS}>{customerName}</span>
          </div>

          {/* Số điện thoại */}
          <div className={ROW_CLS}>
            <span className={LABEL_CLS}>Số điện thoại</span>
            <span className={VALUE_CLS}>{customerPhone ?? "—"}</span>
          </div>

          {/* Hạng thẻ cũ — chỉ hiện khi đã có thẻ */}
          {isChangeMode && (
            <div className={ROW_CLS}>
              <span className={LABEL_CLS}>Hạng thẻ cũ</span>
              <span className={VALUE_CLS}>{currentTierLabel}</span>
            </div>
          )}

          {/* Hạng thẻ mới — PosSearchPopover */}
          <div className={ROW_CLS}>
            <span className={LABEL_CLS}>
              Hạng thẻ mới
              <span className="text-red-500">*</span>
            </span>
            <PosSearchPopover<MembershipCardType>
              inputRef={inputRef}
              value={query}
              onValueChange={(v) => {
                setQuery(v);
                if (!v) setSelectedType(null);
              }}
              search={search}
              onSelect={handleSelect}
              itemKey={(t) => t.id}
              renderItem={(t) => (
                <span className="flex items-center gap-2">
                  <TierDot tier={t.tier} />
                  <span>{t.name}</span>
                </span>
              )}
              placeholder="Chọn loại thẻ"
              ariaLabel="Chọn hạng thẻ mới"
              variant="underline"
              size="sm"
              minChars={0}
            />
          </div>

          {/* Ghi chú */}
          <div className={ROW_CLS}>
            <span className={LABEL_CLS}>Ghi chú</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full bg-transparent text-[13px] text-gray-800 placeholder-gray-300 focus:outline-none"
            />
          </div>
        </div>
      </PosDialog.Body>
      <PosDialog.Footer
        onSave={handleConfirm}
        onCancel={onClose}
        saveLabel={submitting ? "Đang xử lý…" : "Đồng ý"}
        cancelLabel="Đóng"
        saveDisabled={submitting || !selectedType}
      />
    </PosDialog>
  );
}
