import { useCallback, useMemo, useState } from "react";
import { Dialog, DialogContent, cn } from "@erp/ui";
import { useDialogReset } from "../../../hooks/useDialogReset";
import {
  CheckoutDialogFooter,
  CheckoutDialogHeader,
} from "../../common/CheckoutDialogScaffold";
import { VoucherApplyScopeEnum } from "../../../constants/voucher";
import { PosSelect } from "../../common/forms/PosSelect";
import type {
  VoucherApplyScope,
  VoucherDialogData,
  VoucherFormResult,
  VoucherOption,
} from "./types";
import { FormRow } from "./FormRow";
import { QuantityStepper } from "./QuantityStepper";
import { MetricColumn } from "./MetricColumn";
import { RadioOption } from "./RadioOption";
import { PosTextInput } from "../../common/forms/PosTextInput";
import { ItemsTable } from "./ItemsTable";
import { GroupTree } from "./GroupTree";
import { toggleSet } from "./toggleSet";

export interface VoucherDialogProps {
  open: boolean;
  onClose: () => void;
  data?: VoucherDialogData;
  /** Pre-fills the form when the modal mounts. */
  initialValue?: Partial<VoucherFormResult>;
  /** "Đồng ý" — receives the validated form result. */
  onApply?: (result: VoucherFormResult) => void;
}

const SCOPES: ReadonlyArray<{ value: VoucherApplyScope; label: string }> = [
  { value: VoucherApplyScopeEnum.INVOICE, label: "Hóa đơn" },
  { value: VoucherApplyScopeEnum.ITEMS, label: "Hàng hóa" },
  { value: VoucherApplyScopeEnum.GROUPS, label: "Nhóm hàng hóa" },
];

/**
 * "Voucher" modal opened from the PromoMenu's "Voucher" entry. Two-column
 * label/input form with conditional table (scope = ITEMS) or tree
 * (scope = GROUPS) below the radio row. Self-contained — every collaboration
 * point (data, apply, dismiss) is a prop so the host can swap real wiring.
 */
export function VoucherDialog({
  open,
  onClose,
  data,
  initialValue,
  onApply,
}: VoucherDialogProps) {
  const voucherOptions = data?.voucherOptions ?? [];
  const items = data?.items ?? [];
  const groups = data?.groups ?? [];

  const [voucherId, setVoucherId] = useState<string | null>(
    initialValue?.voucherId ?? null,
  );
  const [qty, setQty] = useState<number>(initialValue?.qty ?? 1);
  const [voucherCode, setVoucherCode] = useState<string>(
    initialValue?.voucherCode ?? "",
  );
  const [scope, setScope] = useState<VoucherApplyScope>(
    initialValue?.scope ?? VoucherApplyScopeEnum.INVOICE,
  );
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    () => new Set(initialValue?.selectedItemIds ?? []),
  );
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(
    () => new Set(initialValue?.selectedGroupIds ?? []),
  );

  const handleOpenReset = useCallback(() => {
    setVoucherId(initialValue?.voucherId ?? null);
    setQty(initialValue?.qty ?? 1);
    setVoucherCode(initialValue?.voucherCode ?? "");
    setScope(initialValue?.scope ?? VoucherApplyScopeEnum.INVOICE);
    setSelectedItemIds(new Set(initialValue?.selectedItemIds ?? []));
    setSelectedGroupIds(new Set(initialValue?.selectedGroupIds ?? []));
  }, [
    open,
    initialValue?.voucherId,
    initialValue?.qty,
    initialValue?.voucherCode,
    initialValue?.scope,
    initialValue?.selectedItemIds,
    initialValue?.selectedGroupIds,
  ]);
  useDialogReset(open, handleOpenReset);

  const selectedVoucher = useMemo<VoucherOption | null>(
    () => voucherOptions.find((v) => v.id === voucherId) ?? null,
    [voucherOptions, voucherId],
  );
  const faceValue = selectedVoucher?.faceValue ?? 0;
  const totalValue = faceValue * qty;

  const handleApply = () => {
    onApply?.({
      voucherId,
      qty,
      voucherCode: voucherCode.trim(),
      scope,
      selectedItemIds: Array.from(selectedItemIds),
      selectedGroupIds: Array.from(selectedGroupIds),
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className={cn(
          "flex max-h-[90vh] w-[95vw] max-w-[620px] flex-col gap-0 overflow-hidden p-0",
          "rounded-lg bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)]",
        )}
      >
        {/* 4.2 Header */}
        <CheckoutDialogHeader title="Voucher" />

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 pt-6">
          <div className="flex flex-col gap-6">
            {/* 4.3 Voucher select */}
            <FormRow
              label={
                <>
                  Voucher <span className="text-[#EF4444]">*</span>
                </>
              }
              htmlFor="voucher-select"
            >
              <PosSelect
                id="voucher-select"
                value={voucherId ?? ""}
                onChange={(next) => setVoucherId(next || null)}
                options={voucherOptions.map((opt) => ({
                  value: opt.id,
                  label: opt.label,
                }))}
                placeholder="Chọn voucher"
                variant="underline"
              />
            </FormRow>

            {/* 4.4 Stepper + metrics */}
            <FormRow label="Số lượng">
              <div className="flex items-center justify-between gap-4">
                <QuantityStepper
                  value={qty}
                  onChange={setQty}
                  min={1}
                />
                <MetricColumn faceValue={faceValue} totalValue={totalValue} />
              </div>
            </FormRow>

            {/* 4.5 Voucher code */}
            <FormRow label="Mã voucher" htmlFor="voucher-code-input">
              <PosTextInput
                value={voucherCode}
                onChange={setVoucherCode}
                placeholder="Nhập mã Voucher..."
                variant="underline"
                className="w-full"
                inputClassName="text-[#1F2937] placeholder:italic placeholder:text-[#9CA3AF]"
              />
            </FormRow>

            {/* 4.6 Apply scope */}
            <FormRow label="Áp dụng cho">
              <div
                role="radiogroup"
                aria-label="Áp dụng cho"
                className="flex flex-wrap items-center gap-x-6 gap-y-2"
              >
                {SCOPES.map((opt) => (
                  <RadioOption
                    key={opt.value}
                    name="voucher-apply-scope"
                    value={opt.value}
                    label={opt.label}
                    checked={scope === opt.value}
                    onChange={() => setScope(opt.value)}
                  />
                ))}
              </div>
            </FormRow>

            {/* 4.7 / 4.8 Conditional content */}
            {scope === VoucherApplyScopeEnum.ITEMS ? (
              <ItemsTable
                items={items}
                selectedIds={selectedItemIds}
                onToggle={(id) =>
                  setSelectedItemIds((prev) => toggleSet(prev, id))
                }
                onToggleAll={(next) =>
                  setSelectedItemIds(
                    next ? new Set(items.map((i) => i.id)) : new Set(),
                  )
                }
              />
            ) : null}

            {scope === VoucherApplyScopeEnum.GROUPS ? (
              <GroupTree
                groups={groups}
                selectedIds={selectedGroupIds}
                onToggle={(id) =>
                  setSelectedGroupIds((prev) => toggleSet(prev, id))
                }
                onToggleAll={(next) =>
                  setSelectedGroupIds(
                    next ? new Set(groups.map((g) => g.id)) : new Set(),
                  )
                }
              />
            ) : null}
          </div>
        </div>

        {/* 4.9 Footer */}
        <CheckoutDialogFooter
          className="px-6 py-6"
          onSave={handleApply}
          onCancel={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
