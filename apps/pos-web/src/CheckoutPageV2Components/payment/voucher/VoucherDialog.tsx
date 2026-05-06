import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogTitle, cn, formatVnd } from "@erp/ui";
import { ChevronDownIcon, MinusIcon, PlusIcon } from "../../icons/Icon";
import type {
  VoucherApplyScope,
  VoucherDialogData,
  VoucherFormResult,
  VoucherOption,
  VoucherSelectableGroup,
  VoucherSelectableItem,
} from "./types";

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
  { value: "INVOICE", label: "Hóa đơn" },
  { value: "ITEMS", label: "Hàng hóa" },
  { value: "GROUPS", label: "Nhóm hàng hóa" },
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
    initialValue?.scope ?? "INVOICE",
  );
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    () => new Set(initialValue?.selectedItemIds ?? []),
  );
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(
    () => new Set(initialValue?.selectedGroupIds ?? []),
  );

  // Reset state every time the dialog (re-)opens. Avoids stale picks when the
  // host re-uses the same instance for multiple sessions.
  useEffect(() => {
    if (!open) return;
    setVoucherId(initialValue?.voucherId ?? null);
    setQty(initialValue?.qty ?? 1);
    setVoucherCode(initialValue?.voucherCode ?? "");
    setScope(initialValue?.scope ?? "INVOICE");
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
        <header className="flex items-center px-6 pt-6">
          <DialogTitle className="text-[20px] font-semibold leading-tight text-[#1F2937]">
            Voucher
          </DialogTitle>
        </header>

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
              <UnderlineSelect
                id="voucher-select"
                value={voucherId ?? ""}
                onChange={(next) => setVoucherId(next || null)}
                options={voucherOptions}
                placeholder="Chọn voucher"
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
              <input
                id="voucher-code-input"
                type="text"
                value={voucherCode}
                onChange={(e) => setVoucherCode(e.target.value)}
                placeholder="Nhập mã Voucher..."
                className={cn(
                  "h-8 w-full bg-transparent text-[14px] text-[#1F2937]",
                  "border-b border-[#E5E7EB] py-1",
                  "placeholder:italic placeholder:text-[#9CA3AF]",
                  "focus:border-b-2 focus:border-[#5B5BD6] focus:outline-none",
                )}
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
            {scope === "ITEMS" ? (
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

            {scope === "GROUPS" ? (
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
        <footer className="flex items-center justify-end gap-2 px-6 py-6">
          <button
            type="button"
            onClick={handleApply}
            className={cn(
              "inline-flex h-9 items-center justify-center rounded px-5 text-[14px] font-medium text-white",
              "bg-[#5B5BD6] transition-colors hover:bg-[#4F46E5] active:bg-[#4338CA]",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5B5BD6] focus-visible:ring-offset-2",
            )}
          >
            Đồng ý
          </button>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "inline-flex h-9 items-center justify-center rounded border border-[#D1D5DB] bg-white px-5 text-[14px] font-medium text-[#1F2937]",
              "transition-colors hover:bg-[#F9FAFB] hover:border-[#9CA3AF] active:bg-[#F3F4F6]",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5B5BD6] focus-visible:ring-offset-2",
            )}
          >
            Đóng
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Form layout primitives
// ---------------------------------------------------------------------------

interface FormRowProps {
  label: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}

function FormRow({ label, htmlFor, children }: FormRowProps) {
  return (
    <div className="grid grid-cols-1 items-center gap-2 md:grid-cols-[120px_1fr] md:gap-6">
      <label
        htmlFor={htmlFor}
        className="text-[14px] text-[#6B7280]"
      >
        {label}
      </label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Voucher select (underline + chevron)
// ---------------------------------------------------------------------------

interface UnderlineSelectProps {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  options: VoucherOption[];
  placeholder?: string;
}

function UnderlineSelect({
  id,
  value,
  onChange,
  options,
  placeholder = "—",
}: UnderlineSelectProps) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-8 w-full appearance-none border-b border-[#E5E7EB] bg-transparent pb-2 pl-0 pr-6 pt-1 text-[14px] text-[#1F2937]",
          "focus:border-b-2 focus:border-[#5B5BD6] focus:outline-none",
          value === "" ? "text-[#9CA3AF]" : undefined,
        )}
      >
        <option value="" disabled hidden>
          {placeholder}
        </option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[#6B7280]"
      >
        <ChevronDownIcon size={14} />
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quantity stepper + metrics
// ---------------------------------------------------------------------------

interface QuantityStepperProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}

function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 9999,
}: QuantityStepperProps) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  const onInput = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits === "") {
      onChange(min);
      return;
    }
    const n = Number(digits);
    onChange(Math.min(max, Math.max(min, n)));
  };

  return (
    <div className="flex items-center gap-2">
      <StepperButton
        ariaLabel="Giảm số lượng"
        icon={<MinusIcon size={12} />}
        onClick={dec}
        disabled={value <= min}
      />
      <input
        type="text"
        inputMode="numeric"
        value={String(value)}
        onChange={(e) => onInput(e.target.value)}
        aria-label="Số lượng"
        className={cn(
          "h-6 w-12 border-b border-[#E5E7EB] bg-transparent text-center text-[14px] tabular-nums text-[#1F2937]",
          "focus:border-b-2 focus:border-[#5B5BD6] focus:outline-none",
        )}
      />
      <StepperButton
        ariaLabel="Tăng số lượng"
        icon={<PlusIcon size={12} />}
        onClick={inc}
        disabled={value >= max}
      />
    </div>
  );
}

interface StepperButtonProps {
  ariaLabel: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

function StepperButton({ ariaLabel, icon, onClick, disabled }: StepperButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#D1D5DB] text-[#6B7280] transition-colors",
        "hover:bg-[#F3F4F6] active:bg-[#E5E7EB]",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5B5BD6] focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-40",
      )}
    >
      {icon}
    </button>
  );
}

interface MetricColumnProps {
  faceValue: number;
  totalValue: number;
}

function MetricColumn({ faceValue, totalValue }: MetricColumnProps) {
  return (
    <div className="flex flex-col gap-2 text-[14px] tabular-nums">
      <div className="flex items-center justify-between gap-6">
        <span className="text-[#6B7280]">Mệnh giá</span>
        <span className="text-[#1F2937]">
          {faceValue > 0 ? formatVnd(faceValue) : ""}
        </span>
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="text-[#6B7280]">Giá trị</span>
        <span className="font-semibold text-[#1F2937]">
          {formatVnd(totalValue)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Radio + checkbox primitives
// ---------------------------------------------------------------------------

interface RadioOptionProps {
  name: string;
  value: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}

function RadioOption({ name, value, label, checked, onChange }: RadioOptionProps) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-[14px] text-[#1F2937]">
      <span className="relative inline-flex h-4 w-4 items-center justify-center">
        <input
          type="radio"
          name={name}
          value={value}
          checked={checked}
          onChange={onChange}
          className="peer absolute inset-0 cursor-pointer opacity-0"
        />
        <span
          className={cn(
            "h-4 w-4 rounded-full border transition-colors",
            checked
              ? "border-2 border-[#5B5BD6]"
              : "border border-[#D1D5DB] peer-hover:border-[#9CA3AF]",
            "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-[#5B5BD6] peer-focus-visible:outline-offset-2",
          )}
        />
        {checked ? (
          <span
            aria-hidden="true"
            className="absolute h-2 w-2 rounded-full bg-[#5B5BD6]"
          />
        ) : null}
      </span>
      {label}
    </label>
  );
}

interface CheckboxProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel?: string;
}

function Checkbox({ checked, onChange, ariaLabel }: CheckboxProps) {
  return (
    <label className="relative inline-flex h-4 w-4 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        checked={checked}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 cursor-pointer opacity-0"
      />
      <span
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded-[2px] border transition-colors",
          checked
            ? "border-[#5B5BD6] bg-[#5B5BD6]"
            : "border-[#D1D5DB] bg-white peer-hover:border-[#9CA3AF]",
          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-[#5B5BD6] peer-focus-visible:outline-offset-2",
        )}
      >
        {checked ? (
          <svg
            viewBox="0 0 16 16"
            width="10"
            height="10"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 8.5 6.5 12 13 5" />
          </svg>
        ) : null}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Items table (scope = "ITEMS")
// ---------------------------------------------------------------------------

interface ItemsTableProps {
  items: VoucherSelectableItem[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (next: boolean) => void;
}

function ItemsTable({
  items,
  selectedIds,
  onToggle,
  onToggleAll,
}: ItemsTableProps) {
  const allChecked = items.length > 0 && items.every((i) => selectedIds.has(i.id));

  return (
    <div role="grid" aria-label="Danh sách hàng hóa">
      <div
        role="row"
        className={cn(
          "grid items-center bg-[#F3F4F6] px-3 py-2 text-[14px] font-semibold text-[#1F2937]",
          "grid-cols-[40px_minmax(0,1fr)_48px_96px_96px]",
        )}
      >
        <div role="columnheader" className="flex items-center justify-center">
          <Checkbox
            checked={allChecked}
            onChange={onToggleAll}
            ariaLabel="Chọn tất cả hàng hóa"
          />
        </div>
        <div role="columnheader">Tên hàng hóa</div>
        <div role="columnheader" className="text-right">SL</div>
        <div role="columnheader" className="text-right">Đơn giá</div>
        <div role="columnheader" className="text-right">Thành tiền</div>
      </div>

      <div className="divide-y divide-[#E5E7EB]">
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] italic text-[#9CA3AF]">
            Chưa có hàng hóa nào trong giỏ
          </p>
        ) : (
          items.map((it) => (
            <ItemsRow
              key={it.id}
              item={it}
              checked={selectedIds.has(it.id)}
              onToggle={() => onToggle(it.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface ItemsRowProps {
  item: VoucherSelectableItem;
  checked: boolean;
  onToggle: () => void;
}

function ItemsRow({ item, checked, onToggle }: ItemsRowProps) {
  const lineTotal = item.lineTotal ?? item.qty * item.unitPrice;
  return (
    <div
      role="row"
      className={cn(
        "grid items-center px-3 py-2 text-[14px] text-[#1F2937] transition-colors",
        "grid-cols-[40px_minmax(0,1fr)_48px_96px_96px]",
        checked ? "bg-[#EEF2FF]" : "hover:bg-[#F9FAFB]",
      )}
    >
      <div role="gridcell" className="flex items-center justify-center">
        <Checkbox checked={checked} onChange={onToggle} ariaLabel={item.name} />
      </div>
      <div role="gridcell" className="break-words">
        {item.name}
      </div>
      <div
        role="gridcell"
        className="border-b border-dashed border-[#D1D5DB] text-right tabular-nums"
      >
        {item.qty}
      </div>
      <div role="gridcell" className="text-right tabular-nums">
        {formatVnd(item.unitPrice)}
      </div>
      <div role="gridcell" className="text-right tabular-nums">
        {formatVnd(lineTotal)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Groups tree (scope = "GROUPS")
// ---------------------------------------------------------------------------

interface GroupTreeProps {
  groups: VoucherSelectableGroup[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (next: boolean) => void;
}

function GroupTree({
  groups,
  selectedIds,
  onToggle,
  onToggleAll,
}: GroupTreeProps) {
  const allChecked = groups.length > 0 && groups.every((g) => selectedIds.has(g.id));
  // Build a one-level-deep map: top-level (no parentId) → children.
  const topLevel = groups.filter((g) => !g.parentId);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, VoucherSelectableGroup[]>();
    for (const g of groups) {
      if (!g.parentId) continue;
      const list = map.get(g.parentId) ?? [];
      list.push(g);
      map.set(g.parentId, list);
    }
    return map;
  }, [groups]);

  return (
    <div role="tree" aria-label="Nhóm hàng hóa">
      <div
        className={cn(
          "flex items-center gap-3 bg-[#F3F4F6] px-3 py-2 text-[14px] font-semibold text-[#1F2937]",
        )}
      >
        <Checkbox
          checked={allChecked}
          onChange={onToggleAll}
          ariaLabel="Chọn tất cả nhóm hàng hóa"
        />
        <span>Nhóm hàng hóa</span>
      </div>

      <div className="divide-y divide-[#E5E7EB]">
        {groups.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] italic text-[#9CA3AF]">
            Chưa có nhóm hàng hóa
          </p>
        ) : (
          topLevel.map((g) => (
            <GroupNode
              key={g.id}
              group={g}
              children={childrenByParent.get(g.id) ?? []}
              selectedIds={selectedIds}
              onToggle={onToggle}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface GroupNodeProps {
  group: VoucherSelectableGroup;
  children: VoucherSelectableGroup[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
}

function GroupNode({ group, children, selectedIds, onToggle }: GroupNodeProps) {
  return (
    <>
      <div
        role="treeitem"
        className="flex items-center gap-3 px-3 py-2 text-[14px] text-[#1F2937] hover:bg-[#F9FAFB]"
      >
        <Checkbox
          checked={selectedIds.has(group.id)}
          onChange={() => onToggle(group.id)}
          ariaLabel={group.name}
        />
        <span>{group.name}</span>
      </div>
      {children.map((child) => (
        <div
          key={child.id}
          role="treeitem"
          className="flex items-center gap-3 py-2 pl-9 pr-3 text-[14px] text-[#1F2937] hover:bg-[#F9FAFB]"
        >
          <Checkbox
            checked={selectedIds.has(child.id)}
            onChange={() => onToggle(child.id)}
            ariaLabel={child.name}
          />
          <span>{child.name}</span>
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toggleSet(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
