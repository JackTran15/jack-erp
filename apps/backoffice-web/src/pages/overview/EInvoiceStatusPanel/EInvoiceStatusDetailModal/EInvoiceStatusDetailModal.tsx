import { AppModal, Button } from "@erp/ui";
import type { EInvoiceBranchStatus } from "../../_api/overview.interface";
import { formatViNumber } from "../../_lib/format";

interface Props {
  open: boolean;
  branches: EInvoiceBranchStatus[];
  onClose: () => void;
}

const NUMBER_COLUMNS = [
  { key: "unissued", label: "Hóa đơn chưa phát hành" },
  { key: "failed", label: "Hóa đơn phát hành lỗi" },
  { key: "issued", label: "Hóa đơn đã phát hành" },
] as const;

const TH = "h-8 border border-[#E0E0E0] px-2.5 text-center font-bold text-[#333333]";
const TD = "h-8 border border-[#E0E0E0] px-2.5 text-[#333333]";

/** Modal "Xem chi tiết tình hình Phát hành hóa đơn" — bảng HĐĐT theo chi nhánh. */
export function EInvoiceStatusDetailModal({ open, branches, onClose }: Props) {
  return (
    <AppModal
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Xem chi tiết tình hình Phát hành hóa đơn"
      defaultWidth={1000}
      defaultHeight={520}
      footer={
        <div className="flex w-full items-center justify-end">
          <Button type="button" className="h-9 min-w-[90px]" onClick={onClose}>
            Đóng
          </Button>
        </div>
      }
    >
      <table className="w-full table-fixed border-collapse text-[13px] leading-5">
        <colgroup>
          <col className="w-[250px]" />
          <col />
          <col />
          <col />
          <col className="w-[120px]" />
        </colgroup>
        <thead className="bg-[#F5F5F5]">
          <tr>
            <th className={TH}>Tên chi nhánh</th>
            {NUMBER_COLUMNS.map((col) => (
              <th key={col.key} className={TH}>
                {col.label}
              </th>
            ))}
            <th className={TH} aria-label="Thao tác" />
          </tr>
        </thead>
        <tbody>
          {branches.map((branch) => (
            <tr key={branch.branchId} className="even:bg-[#F5F5F5]">
              <td className={`${TD} truncate`}>{branch.branchName}</td>
              {NUMBER_COLUMNS.map((col) => (
                <td key={col.key} className={`${TD} text-right tabular-nums`}>
                  {formatViNumber(branch[col.key])}
                </td>
              ))}
              <td className={TD}>
                {/* Chưa có trang HĐĐT để điều hướng — nối hành động khi có backend. */}
                <button
                  type="button"
                  className="text-[#2B2E6E] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2B2E6E]/40"
                >
                  Kiểm tra
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AppModal>
  );
}
