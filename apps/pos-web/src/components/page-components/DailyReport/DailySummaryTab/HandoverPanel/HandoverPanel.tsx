import type { Dispatch, ReactNode, SetStateAction } from "react";
import { cn } from "@erp/ui";
import type {
  IDropdownOption,
  PosDailySummaryResult,
} from "@erp/shared-interfaces";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import { PosNumberInput } from "@erp/pos/components/common/PosNumberInput/PosNumberInput";
import { CartIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { useReportFilterOptionsQuery } from "@erp/pos/hooks/react-query/use-query-daily-report";
import {
  formatNumberVi,
  staffOptionName,
} from "@erp/pos/lib/page-libs/daily-report/formatDailyReport";
import type {
  CashCountState,
  CashHandoverForm,
} from "@erp/pos/interfaces/daily-report.interface";
import { SectionCard } from "@erp/pos/components/page-components/DailyReport/SectionCard/SectionCard";
import { SubHeading } from "@erp/pos/components/page-components/DailyReport/SubHeading/SubHeading";
import { CashCountModal } from "./CashCountModal/CashCountModal";

export interface HandoverPanelProps {
  summary: PosDailySummaryResult | null;
  handover: CashHandoverForm;
  setHandover: Dispatch<SetStateAction<CashHandoverForm>>;
  cashCount: CashCountState;
  setCashCount: Dispatch<SetStateAction<CashCountState>>;
  cashCountOpen: boolean;
  openCashCount: () => void;
  closeCashCount: () => void;
  onPrint: () => void;
  className?: string;
}

const NONE: IDropdownOption = { value: "", label: "Nhân viên" };

/** Label (7/12) : control (5/12) row — matches the panel's grid spec. */
function GridRow({
  label,
  indent,
  children,
}: {
  label: string;
  indent?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-12 items-center gap-3">
      <span className={cn("col-span-7 text-[#4B5163]", indent && "pl-4")}>
        {label}
      </span>
      <div className="col-span-5">{children}</div>
    </div>
  );
}

/** Read-only numeric value in the 5-col value slot, right-aligned. */
function GridValue({
  label,
  value,
  indent,
  bold,
}: {
  label: string;
  value: number;
  indent?: boolean;
  bold?: boolean;
}) {
  return (
    <GridRow label={label} indent={indent}>
      <span
        className={cn(
          "block text-right tabular-nums text-[#1F2233]",
          bold && "font-bold",
        )}
      >
        {formatNumberVi(value)}
      </span>
    </GridRow>
  );
}

/** Full-width button confined to the 5-col value slot, right-aligned. */
function GridButton({
  onClick,
  variant = "outline",
  children,
}: {
  onClick: () => void;
  variant?: "outline" | "solid";
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-12 items-center gap-3">
      <div className="col-span-7" />
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "col-span-5 rounded-lg py-2 text-[14px] font-medium",
          variant === "outline"
            ? "border border-[#E1E3EA] text-[#4F46E5] hover:bg-[#FAFAFB]"
            : "bg-[#6366F1] font-semibold text-white hover:bg-[#4F46E5]",
        )}
      >
        {children}
      </button>
    </div>
  );
}

/** BÀN GIAO TIỀN — FE-only manual form (not persisted). */
export function HandoverPanel({
  summary,
  handover,
  setHandover,
  cashCount,
  setCashCount,
  cashCountOpen,
  openCashCount,
  closeCashCount,
  onPrint,
  className,
}: HandoverPanelProps) {
  const staff = useReportFilterOptionsQuery("cashier");
  const staffItems = [NONE, ...(staff.data ?? [])];
  const pick = (id: string | null) =>
    staffItems.find((s) => String(s.value) === (id ?? "")) ?? NONE;

  // Chênh lệch = tiền đầu kỳ + thu tiền mặt − chi tiền mặt − tiền bàn giao.
  const variance =
    handover.openingAmount +
    (summary?.revenue.cash ?? 0) -
    (summary?.expense.cash ?? 0) -
    handover.handoverAmount;

  return (
    <SectionCard title="Bàn giao tiền" icon={CartIcon} className={className}>
      <div className="space-y-3">
        <GridRow label="Số tiền bàn giao từ ban đầu">
          <PosNumberInput
            value={handover.openingAmount}
            onChange={(next) =>
              setHandover((p) => ({ ...p, openingAmount: Math.max(0, next) }))
            }
            variant="boxed"
            className="w-full"
          />
        </GridRow>

        <GridRow label="Nhận từ">
          <PosSelect<IDropdownOption>
            value={pick(handover.receivedFromId)}
            onChange={(item) =>
              setHandover((p) => ({
                ...p,
                receivedFromId: item.value ? String(item.value) : null,
              }))
            }
            items={staffItems}
            itemKey={(item) => String(item.value)}
            renderItem={(item) => item.label}
            renderSelected={staffOptionName}
            className="w-full"
            menuMinWidth={260}
          />
        </GridRow>

        <SubHeading label="Bàn giao" />
        <GridRow label="Tiền bàn giao">
          <PosNumberInput
            value={handover.handoverAmount}
            onChange={(next) =>
              setHandover((p) => ({ ...p, handoverAmount: Math.max(0, next) }))
            }
            variant="boxed"
            className="w-full"
            inputClassName="font-bold"
          />
        </GridRow>

        <GridButton onClick={openCashCount}>Chi tiết kiểm đếm</GridButton>

        <GridValue label="Chênh lệch" value={variance} />
        {/* Từ khi Chi đọc cả phiếu chi (trừ loại hoàn tiền), chênh lệch đã trừ
            được tiền rút khỏi két bằng phiếu chi. Phần còn thiếu là tiền thừa
            khách không lấy lại — nằm ngoài invoice_payments nên không vào Thu. */}
        <p className="pl-3 pt-1 text-[11px] italic leading-snug text-[#8A90A2]">
          Chênh lệch tính theo thu/chi tiền mặt của hóa đơn và phiếu chi; chưa
          gồm tiền thừa khách không lấy lại.
        </p>

        <GridValue
          label="Tổng SL hóa đơn"
          value={summary?.other.totalInvoices ?? 0}
        />
        <GridValue
          label="SL hóa đơn bán hàng"
          value={summary?.other.saleInvoices ?? 0}
          indent
        />
        <GridValue
          label="SL hóa đơn đổi trả"
          value={summary?.other.returnInvoices ?? 0}
          indent
        />
        <GridValue
          label="SL hóa đơn đổi trả, mua thêm"
          value={summary?.other.exchangeInvoices ?? 0}
          indent
        />

        <GridValue label="SL Voucher" value={summary?.other.voucherCount ?? 0} />
        <GridValue
          label="SL Mã ưu đãi"
          value={summary?.other.promoCodeCount ?? 0}
        />
        <GridValue
          label="SL Biên lai thanh toán thẻ"
          value={summary?.other.cardReceiptCount ?? 0}
        />

        <GridRow label="Người nhận bàn giao">
          <PosSelect<IDropdownOption>
            value={pick(handover.handedOverToId)}
            onChange={(item) =>
              setHandover((p) => ({
                ...p,
                handedOverToId: item.value ? String(item.value) : null,
              }))
            }
            items={staffItems}
            itemKey={(item) => String(item.value)}
            renderItem={(item) => item.label}
            renderSelected={staffOptionName}
            position="top"
            className="w-full"
            menuMinWidth={260}
          />
        </GridRow>

        <textarea
          placeholder="Nhập ghi chú ..."
          value={handover.note}
          onChange={(e) => setHandover((p) => ({ ...p, note: e.target.value }))}
          className="h-16 w-full resize-none rounded-md border border-[#E1E3EA] px-3 py-2 text-[14px] focus:border-[#6366F1] focus:outline-none"
        />

        <GridButton onClick={onPrint} variant="solid">
          In bàn giao
        </GridButton>
      </div>

      <CashCountModal
        open={cashCountOpen}
        value={cashCount}
        onClose={closeCashCount}
        onApply={(total, counts) => {
          setCashCount(counts);
          setHandover((p) => ({ ...p, handoverAmount: total }));
          closeCashCount();
        }}
      />
    </SectionCard>
  );
}
