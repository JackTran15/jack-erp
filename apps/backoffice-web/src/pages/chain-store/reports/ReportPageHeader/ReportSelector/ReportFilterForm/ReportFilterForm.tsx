import { Button } from "@erp/ui";
import { Check, X } from "lucide-react";
import {
  getReportFormLines,
  getReportTypeLabel,
} from "../../../../../../constants/reports/report-type.constant";
import { useReportStore } from "../../../../../../store/page-stores/report/report.context";
import { ReportTypeSelect } from "./ReportTypeSelect/ReportTypeSelect";
import { ReportFilterLine } from "./ReportFilterLine/ReportFilterLine";

interface Props {
  onSubmit: () => void;
  onCancel: () => void;
}

export function ReportFilterForm({ onSubmit, onCancel }: Props) {
  const reportType = useReportStore((s) => s.reportType);
  const branch = useReportStore((s) => s.branch);
  const listReport = useReportStore((s) => s.listReport);
  const setReportType = useReportStore((s) => s.actions.setReportType);

  const typeOptions = listReport.map((v) => ({
    value: v,
    label: getReportTypeLabel(v),
  }));
  const lines = getReportFormLines(reportType, branch);

  return (
    <div className="flex w-[640px] max-w-[calc(100vw-2rem)] flex-col">
      <div className="flex flex-col divide-y divide-border">
        {/* Dòng chọn báo cáo: field đặc biệt, luôn hiển thị. */}
        <div className="flex items-start gap-4 py-2">
          <div className="w-[140px] shrink-0 pt-1.5 text-[13px] text-muted-foreground">
            Báo cáo<span className="text-destructive"> *</span>
          </div>
          <div className="min-w-0 flex-1">
            <ReportTypeSelect
              value={reportType}
              options={typeOptions}
              onChange={setReportType}
            />
          </div>
        </div>

        {lines.map((line) => (
          <ReportFilterLine key={line} line={line} />
        ))}
      </div>

      <div className="mt-3 flex items-center justify-end gap-3">
        <Button type="button" size="sm" onClick={onSubmit}>
          <Check className="mr-1 h-4 w-4" />
          Đồng ý
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          <X className="mr-1 h-4 w-4" />
          Hủy bỏ
        </Button>
      </div>
    </div>
  );
}
