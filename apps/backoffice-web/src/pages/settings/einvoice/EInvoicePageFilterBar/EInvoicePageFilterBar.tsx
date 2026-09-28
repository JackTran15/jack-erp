import { Button, PeriodFilter } from "@erp/ui";
import { CloudUpload, Send, Settings, X } from "lucide-react";
import {
  useEInvoiceActions,
  useEInvoiceStore,
} from "../../../../store/page-stores/einvoice/einvoice.store";
import { EINVOICE_QUOTA } from "../_mock/einvoice.mock";
import { notifyNotSupported, useEInvoiceMutations } from "../_lib/useEInvoiceMutations";

interface Props {
  /** Tên chi nhánh đang lọc qua `?branchId=` (từ nút "Kiểm tra" ở Tổng quan). */
  branchName: string | null;
  onClearBranch: () => void;
}

/**
 * Toolbar 2 hàng bên trái (kỳ + nút; nút phát hành) và khối "Mã số thuế / Số HĐ
 * còn được sử dụng" bên phải.
 */
export function EInvoicePageFilterBar({ branchName, onClearBranch }: Props) {
  const tab = useEInvoiceStore((s) => s.tab);
  const period = useEInvoiceStore((s) => s.period);
  const checkedIds = useEInvoiceStore((s) => s.checkedIds);
  const { setPeriod, applyFilter, setCheckedIds } = useEInvoiceActions();
  const { issue } = useEInvoiceMutations();

  const unissued = tab === "unissued";
  const nothingChecked = checkedIds.length === 0;

  return (
    <div className="flex w-full items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <PeriodFilter value={period} onChange={setPeriod} onApply={applyFilter} />
          <Button type="button" variant="outline" size="sm" onClick={notifyNotSupported}>
            <Settings className="mr-1.5 h-4 w-4" />
            Thiết lập kết nối
          </Button>
          {unissued ? null : (
            <Button type="button" variant="outline" size="sm" onClick={notifyNotSupported}>
              <CloudUpload className="mr-1.5 h-4 w-4" />
              Xuất khẩu
            </Button>
          )}
          {branchName ? (
            <span className="inline-flex h-8 items-center gap-1 rounded-sm border bg-background pl-2 pr-1 text-[13px]">
              Chi nhánh: <strong className="font-semibold">{branchName}</strong>
              <button
                type="button"
                aria-label="Bỏ lọc chi nhánh"
                className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted"
                onClick={onClearBranch}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {unissued ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={checkedIds.length < 2}
                onClick={notifyNotSupported}
              >
                <Send className="mr-1.5 h-4 w-4" />
                Phát hành gộp HĐ điện tử
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={nothingChecked || issue.isPending}
                onClick={() =>
                  issue.mutate({ ids: checkedIds }, { onSuccess: () => setCheckedIds([]) })
                }
              >
                <Send className="mr-1.5 h-4 w-4" />
                Phát hành HĐ điện tử
              </Button>
            </>
          ) : (
            <Button type="button" size="sm" disabled={nothingChecked} onClick={notifyNotSupported}>
              <Send className="mr-1.5 h-4 w-4" />
              Phát hành lại HĐ điện tử
            </Button>
          )}
        </div>
      </div>

      <dl className="grid shrink-0 grid-cols-[auto_auto] gap-x-6 gap-y-1 rounded-sm border bg-background px-3 py-2 text-[13px]">
        <dt className="font-semibold">Mã số thuế</dt>
        <dt className="font-semibold">Số HĐ còn được sử dụng</dt>
        <dd>{EINVOICE_QUOTA.taxCode}</dd>
        <dd className="flex flex-col items-start">
          {EINVOICE_QUOTA.remaining}
          <button type="button" className="text-primary-blue hover:underline" onClick={notifyNotSupported}>
            Mua thêm HĐ
          </button>
        </dd>
      </dl>
    </div>
  );
}
