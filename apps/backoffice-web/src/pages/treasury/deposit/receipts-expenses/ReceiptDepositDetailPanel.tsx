import { formatMoneyInteger } from "@erp/ui";
import type { BankVoucherLine } from "../../bank-vouchers.types";
import { TABLE_NUM_CLASS } from "../../ledger-cash/ledger-cash.constants";

interface Props {
  lines: BankVoucherLine[];
  categoryNames?: Map<string, string>;
}

function lineTotal(lines: BankVoucherLine[]): number {
  return lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
}

export function ReceiptDepositDetailPanel({ lines, categoryNames }: Props) {
  const total = lineTotal(lines);

  return (
    <div className="px-4 py-3">
      <div className="mb-2 inline-block border-b-2 border-primary px-2 pb-1 text-sm font-semibold">
        Chi tiết
      </div>
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Chọn một chứng từ để xem chi tiết.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b">
              <th className="border-r px-2 py-1.5 text-left font-medium">
                Diễn giải
              </th>
              <th className="border-r px-2 py-1.5 text-right font-medium">
                Số tiền
              </th>
              <th className="px-2 py-1.5 text-left font-medium">Mục thu/chi</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={`${line.description}-${i}`} className="border-b">
                <td className="border-r px-2 py-1">{line.description}</td>
                <td className={`border-r px-2 py-1 ${TABLE_NUM_CLASS}`}>
                  {formatMoneyInteger(line.amount)}
                </td>
                <td className="px-2 py-1">
                  {line.categoryId
                    ? (categoryNames?.get(line.categoryId) ?? line.categoryId)
                    : ""}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30 font-semibold">
              <td className="border-r px-2 py-1.5">Tổng</td>
              <td className={`border-r px-2 py-1.5 ${TABLE_NUM_CLASS}`}>
                {formatMoneyInteger(total)}
              </td>
              <td className="px-2 py-1.5" />
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}
