import type { Dispatch, SetStateAction } from "react";
import { cn } from "@erp/ui";
import type {
  PosDailySummaryResult,
  ReportDateRangeFilter,
} from "@erp/shared-interfaces";
import { PosDailySummaryDetailCategory } from "@erp/shared-interfaces";
import {
  CartIcon,
  GridIcon,
  TruckIcon,
} from "@erp/pos/components/common/PosIcons/PosIcons";
import { formatNumberVi } from "@erp/pos/lib/page-libs/daily-report/formatDailyReport";
import type {
  CashCountState,
  CashHandoverForm,
} from "@erp/pos/interfaces/daily-report.interface";
import { SectionCard } from "@erp/pos/components/page-components/DailyReport/SectionCard/SectionCard";
import { SubHeading } from "@erp/pos/components/page-components/DailyReport/SubHeading/SubHeading";
import { HandoverPanel } from "./HandoverPanel/HandoverPanel";
import { DailySummaryDetailModal } from "./DailySummaryDetailModal/DailySummaryDetailModal";

export interface DailySummaryTabProps {
  summary: PosDailySummaryResult | null;
  handover: CashHandoverForm;
  setHandover: Dispatch<SetStateAction<CashHandoverForm>>;
  cashCount: CashCountState;
  setCashCount: Dispatch<SetStateAction<CashCountState>>;
  cashCountOpen: boolean;
  openCashCount: () => void;
  closeCashCount: () => void;
  onPrint: () => void;
  issuedAt: ReportDateRangeFilter;
  cashierId: string | null;
  salespersonId: string | null;
  detailCategory: PosDailySummaryDetailCategory | null;
  onOpenDetail: (category: PosDailySummaryDetailCategory) => void;
  onCloseDetail: () => void;
}

function Row({
  label,
  value,
  indent = true,
  onClick,
}: {
  label: string;
  value: number;
  /** Same 2-level scheme as HandoverPanel's GridRow: top-level rows are flush, breakdown rows are indented. */
  indent?: boolean;
  /** "Xem chi tiết" — opens the drill-down modal for this line item. Omit for rows with no detail source yet. */
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-between pl-3 text-left"
      >
        <span className="text-[#4B5163]">{label}</span>
        <span className="tabular-nums font-bold text-[#6366F1] underline decoration-dotted underline-offset-2 hover:text-[#4F46E5]">
          {formatNumberVi(value)}
        </span>
      </button>
    );
  }
  return (
    <div className={cn("flex items-center justify-between", indent && "pl-3")}>
      <span className="text-[#4B5163]">{label}</span>
      <span className="tabular-nums font-bold text-[#1F2233]">
        {formatNumberVi(value)}
      </span>
    </div>
  );
}

export function DailySummaryTab({
  summary,
  handover,
  setHandover,
  cashCount,
  setCashCount,
  cashCountOpen,
  openCashCount,
  closeCashCount,
  onPrint,
  issuedAt,
  cashierId,
  salespersonId,
  detailCategory,
  onOpenDetail,
  onCloseDetail,
}: DailySummaryTabProps) {
  const s = summary;

  const cardClass = "flex-1 min-w-[320px] max-w-[calc((1280px-48px)/3)]";

  return (
    <div className="flex min-h-0 flex-1 flex-wrap content-start gap-6 overflow-auto p-4 justify-center">
      {/* Column 1 — TỔNG (Thu / Chi / Công nợ) */}
      <SectionCard
        className={cardClass}
        title="Tổng (1) - (2)"
        headerRight={
          <span className="tabular-nums text-[16px] font-bold text-[#6366F1]">
            {formatNumberVi(s?.netCashFlow ?? 0)}
          </span>
        }
      >
        <SubHeading label="Thu (1)" />
        <Row
          label="Tiền mặt"
          value={s?.revenue.cash ?? 0}
          onClick={() => onOpenDetail(PosDailySummaryDetailCategory.RevenueCash)}
        />
        <Row label="Thẻ" value={s?.revenue.card ?? 0} />
        <Row
          label="Chuyển khoản"
          value={s?.revenue.bankTransfer ?? 0}
          onClick={() => onOpenDetail(PosDailySummaryDetailCategory.RevenueBankTransfer)}
        />
        <Row label="Voucher" value={s?.revenue.voucher ?? 0} />

        {/* "Điểm" và "Khuyến mại" là khoản giảm giá, không phải tiền vào quỹ —
            chúng đã bị trừ trong amountDue nên KHÔNG cộng vào "Tổng (1) - (2)".
            Vì vậy tổng hiển thị không bằng tổng số học của các dòng trong mục
            Thu; chú thích bên dưới để người đọc không tưởng báo cáo cộng sai. */}
        <Row
          label="Điểm"
          value={s?.revenue.points ?? 0}
          onClick={() => onOpenDetail(PosDailySummaryDetailCategory.RevenuePoints)}
        />
        <Row label="Khuyến mại" value={s?.revenue.promotion ?? 0} />
        <p className="pl-3 pt-1 text-[11px] italic leading-snug text-[#8A90A2]">
          Điểm và Khuyến mại là khoản giảm giá, không tính vào tổng thu.
        </p>

        <SubHeading label="Chi (2)" />
        <Row
          label="Tiền mặt"
          value={s?.expense.cash ?? 0}
          onClick={() => onOpenDetail(PosDailySummaryDetailCategory.ExpenseCash)}
        />
        <Row
          label="Chuyển khoản"
          value={s?.expense.bankTransfer ?? 0}
          onClick={() => onOpenDetail(PosDailySummaryDetailCategory.ExpenseBankTransfer)}
        />

        <SubHeading label="Công nợ (3)" />
        <Row
          label="Ghi nợ"
          value={s?.debt.newDebt ?? 0}
          onClick={() => onOpenDetail(PosDailySummaryDetailCategory.DebtIncrease)}
        />
        <Row
          label="Giảm nợ"
          value={s?.debt.debtCollected ?? 0}
          onClick={() => onOpenDetail(PosDailySummaryDetailCategory.DebtDecrease)}
        />
      </SectionCard>

      {/* Column 2 — HÀNG BÁN / HÀNG TRẢ / KHÁC */}
      <div className={`${cardClass} space-y-4`}>
        <SectionCard title="Hàng bán" icon={CartIcon}>
          <Row label="Số lượng" value={s?.goodsSold.quantity ?? 0} indent={false}/>
          <Row label="Giá trị" value={s?.goodsSold.value ?? 0} indent={false} />
        </SectionCard>
        <SectionCard title="Hàng trả" icon={TruckIcon}>
          <Row label="Số lượng" value={s?.goodsReturned.quantity ?? 0} indent={false} />
          <Row label="Giá trị" value={s?.goodsReturned.value ?? 0} indent={false} />
        </SectionCard>
        <SectionCard title="Khác" icon={GridIcon}>
          <Row
            label="Tổng SL hóa đơn"
            value={s?.other.totalInvoices ?? 0}
            indent={false}
          />
          <Row label="SL hóa đơn bán hàng" value={s?.other.saleInvoices ?? 0} />
          <Row label="SL hóa đơn đổi trả" value={s?.other.returnInvoices ?? 0} />
          <Row
            label="SL hóa đơn đổi trả, mua thêm"
            value={s?.other.exchangeInvoices ?? 0}
          />
          <Row
            label="SL Voucher"
            value={s?.other.voucherCount ?? 0}
            indent={false}
          />
          <Row
            label="SL Mã ưu đãi"
            value={s?.other.promoCodeCount ?? 0}
            indent={false}
          />
          <Row
            label="SL Biên lai thanh toán thẻ"
            value={s?.other.cardReceiptCount ?? 0}
            indent={false}
          />
        </SectionCard>
      </div>

      {/* Column 3 — BÀN GIAO TIỀN */}
      <HandoverPanel
        className={cardClass}
        summary={summary}
        handover={handover}
        setHandover={setHandover}
        cashCount={cashCount}
        setCashCount={setCashCount}
        cashCountOpen={cashCountOpen}
        openCashCount={openCashCount}
        closeCashCount={closeCashCount}
        onPrint={onPrint}
      />

      <DailySummaryDetailModal
        category={detailCategory}
        issuedAt={issuedAt}
        cashierId={cashierId}
        salespersonId={salespersonId}
        onClose={onCloseDetail}
      />
    </div>
  );
}
