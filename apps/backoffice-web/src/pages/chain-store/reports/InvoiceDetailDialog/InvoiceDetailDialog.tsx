import { useQuery } from "@tanstack/react-query";
import { AppModal, Button } from "@erp/ui";
import { CloudUpload, X } from "lucide-react";
import { toast } from "sonner";
import { useReportStore } from "../../../../store/page-stores/report/report.context";
import { fetchInvoiceDetail } from "../_api/invoice-report.api";
import { InvoiceDetailHeading } from "./InvoiceDetailHeading/InvoiceDetailHeading";
import { InvoiceDetailLines } from "./InvoiceDetailLines/InvoiceDetailLines";
import { InvoiceDetailMeta } from "./InvoiceDetailMeta/InvoiceDetailMeta";
import { InvoiceDetailTotals } from "./InvoiceDetailTotals/InvoiceDetailTotals";

export function InvoiceDetailDialog() {
  const code = useReportStore((s) => s.detailInvoiceCode);
  const setDetailInvoiceCode = useReportStore(
    (s) => s.actions.setDetailInvoiceCode,
  );

  const query = useQuery({
    queryKey: ["invoice-detail", code],
    queryFn: () => fetchInvoiceDetail(code as string),
    enabled: !!code,
  });

  const detail = query.data;

  return (
    <AppModal
      open={!!code}
      onOpenChange={(open) => {
        if (!open) setDetailInvoiceCode(null);
      }}
      title="Chi tiết hóa đơn"
      defaultWidth={1040}
      defaultHeight={680}
      minWidth={760}
      minHeight={480}
      showFooter={false}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
          {query.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Đang tải chi tiết hóa đơn…
            </p>
          ) : query.isError || !detail ? (
            <p className="py-8 text-center text-sm text-destructive">
              Không tải được chi tiết hóa đơn.
            </p>
          ) : (
            <>
              <InvoiceDetailHeading type={detail.type} />
              <InvoiceDetailMeta detail={detail} />
              <InvoiceDetailLines detail={detail} />
              <InvoiceDetailTotals detail={detail} />
            </>
          )}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.info("Tính năng xuất khẩu sẽ được bổ sung.")}
          >
            <CloudUpload className="mr-1.5 h-4 w-4" />
            Xuất khẩu
          </Button>
          <Button size="sm" onClick={() => setDetailInvoiceCode(null)}>
            <X className="mr-1.5 h-4 w-4" />
            Đóng
          </Button>
        </div>
      </div>
    </AppModal>
  );
}
