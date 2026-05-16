import { useCallback, useMemo, useState } from "react";
import { cn, formatVnd } from "@erp/ui";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import {
  PosDataTable,
  type PosDataTableColumn,
} from "@erp/pos/components/common/PosDataTable/PosDataTable";
import { useDialogReset } from "@erp/pos/hooks/common/use-dialog-reset";
import { VoucherApplyScopeEnum } from "@erp/pos/constants/checkout.constant";
import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import type {
  VoucherApplyScope,
  VoucherDialogData,
  VoucherFormResult,
  VoucherOption,
  VoucherSelectableItem,
} from "@erp/pos/lib/page-libs/checkout/voucher.types";
import { FormRow } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/PromoMenu/VoucherDialog/FormRow/FormRow";
import { QuantityStepper } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/PromoMenu/VoucherDialog/QuantityStepper/QuantityStepper";
import { MetricColumn } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/PromoMenu/VoucherDialog/MetricColumn/MetricColumn";
import { RadioOption } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/PromoMenu/VoucherDialog/RadioOption/RadioOption";
import { PosTextInput } from "@erp/pos/components/common/PosTextInput/PosTextInput";
import { GroupTree } from "@erp/pos/components/page-components/Checkout/CheckoutRightPane/PaymentSummaryPanel/PromoMenu/VoucherDialog/GroupTree/GroupTree";
import { toggleSet } from "@erp/pos/lib/page-libs/checkout/voucher.toggleSet";

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

  const allItemsChecked =
    items.length > 0 && items.every((i) => selectedItemIds.has(i.id));
  const itemColumns = useMemo<
    ReadonlyArray<PosDataTableColumn<VoucherSelectableItem>>
  >(
    () => [
      {
        key: "select",
        title: (
          <PosCheckbox
            checked={allItemsChecked}
            onChange={(next) =>
              setSelectedItemIds(
                next ? new Set(items.map((i) => i.id)) : new Set(),
              )
            }
            ariaLabel="Chọn tất cả hàng hóa"
          />
        ),
        headerClassName: "w-10",
        cellClassName: "w-10",
        render: (row) => (
          <PosCheckbox
            checked={selectedItemIds.has(row.id)}
            onChange={() => setSelectedItemIds((prev) => toggleSet(prev, row.id))}
            ariaLabel={row.name}
          />
        ),
      },
      {
        key: "name",
        title: "Tên hàng hóa",
        render: (row) => row.name,
      },
      {
        key: "qty",
        title: "SL",
        align: "right",
        headerClassName: "w-12",
        cellClassName: "tabular-nums",
        render: (row) => row.qty,
      },
      {
        key: "unitPrice",
        title: "Đơn giá",
        align: "right",
        headerClassName: "w-24",
        cellClassName: "tabular-nums",
        render: (row) => formatVnd(row.unitPrice),
      },
      {
        key: "lineTotal",
        title: "Thành tiền",
        align: "right",
        headerClassName: "w-24",
        cellClassName: "tabular-nums",
        render: (row) =>
          formatVnd(row.lineTotal ?? row.qty * row.unitPrice),
      },
    ],
    [allItemsChecked, items, selectedItemIds],
  );

  return (
    <PosDialog
      open={open}
      onClose={onClose}
      width={620}
      contentClassName="bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
    >
      <PosDialog.Header title="Voucher" />
      <PosDialog.Body>
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
                value={selectedVoucher}
                onChange={(item) => setVoucherId(item.id || null)}
                items={voucherOptions}
                itemKey={(opt) => opt.id}
                renderItem={(opt) => opt.label}
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
              <div aria-label="Danh sách hàng hóa">
                <PosDataTable<VoucherSelectableItem>
                  columns={itemColumns}
                  dataSource={items}
                  rowKey={(row) => row.id}
                  emptyText="Chưa có hàng hóa nào trong giỏ"
                  rowClassName={(row) =>
                    cn(selectedItemIds.has(row.id) && "bg-[#EEF2FF]")
                  }
                />
              </div>
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
      </PosDialog.Body>
      <PosDialog.Footer
        onSave={handleApply}
        onCancel={onClose}
      />
    </PosDialog>
  );
}
