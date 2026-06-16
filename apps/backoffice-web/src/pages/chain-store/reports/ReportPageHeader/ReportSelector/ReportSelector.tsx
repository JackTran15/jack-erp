import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@erp/ui";
import { useReportStore } from "../../../../../store/page-stores/report/report.context";
import { ReportFilterForm } from "./ReportFilterForm/ReportFilterForm";

export function ReportSelector() {
  const [open, setOpen] = useState(false);
  const applyFilters = useReportStore((s) => s.actions.applyFilters);

  const handleSubmit = () => {
    applyFilters();
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
