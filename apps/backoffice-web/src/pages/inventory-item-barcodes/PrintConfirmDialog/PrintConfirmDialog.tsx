import { AppModal, Button } from "@erp/ui";
import { TriangleAlert } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  printing: boolean;
  /** In thử — tối đa 2 tem để quét kiểm tra. */
  onTestPrint: () => void;
  /** In hàng loạt — in toàn bộ tem. */
  onBulkPrint: () => void;
}

/** Dialog cảnh báo trước khi in tem hàng loạt: In thử (≤2 tem) hoặc In hàng loạt. */
export function PrintConfirmDialog({
  open,
  onOpenChange,
  printing,
  onTestPrint,
  onBulkPrint,
}: Props) {
  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Back Office"
      bodyStretch={false}
      defaultWidth={480}
      defaultHeight={205}
      minHeight={205}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onTestPrint} disabled={printing}>
            In thử
          </Button>
          <Button type="button" onClick={onBulkPrint} disabled={printing}>
            In hàng loạt
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-4 py-2">
        <TriangleAlert className="h-10 w-10 shrink-0 text-amber-400" />
        <p className="text-sm leading-relaxed text-foreground">
          Trước khi in tem hàng loạt, Quý khách nên in và quét thử tem với máy
          quét mã vạch để kiểm tra lại, tránh xảy ra sai sót.
        </p>
      </div>
    </AppModal>
  );
}
