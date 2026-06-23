import { useState } from "react";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@erp/ui";
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
        <Button type="button" size="sm" className="absolute left-0">
          Chọn báo cáo
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto">
        <ReportFilterForm onSubmit={handleSubmit} onCancel={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
