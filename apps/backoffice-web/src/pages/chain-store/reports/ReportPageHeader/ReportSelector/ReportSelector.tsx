import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@erp/ui";
import { useReportStore } from "../../../../../store/page-stores/report/report.context";
import { buildReportSubmitPayload } from "../../../../../store/page-stores/report/report.store";
import { ReportFilterForm } from "./ReportFilterForm/ReportFilterForm";

export function ReportSelector() {
  const [open, setOpen] = useState(false);
  const reportType = useReportStore((s) => s.reportType);
  const filters = useReportStore((s) => s.filters);

  const handleSubmit = () => {
    const payload = buildReportSubmitPayload({ reportType, filters });
    // eslint-disable-next-line no-console
    console.log("[report-filter] submit", payload);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="absolute left-0 h-[30px] rounded-[3px] bg-[#2B3164] px-3.5 text-[13px] text-white hover:bg-[#3A4178]"
        >
          Chọn báo cáo
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto">
        <ReportFilterForm onSubmit={handleSubmit} onCancel={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
