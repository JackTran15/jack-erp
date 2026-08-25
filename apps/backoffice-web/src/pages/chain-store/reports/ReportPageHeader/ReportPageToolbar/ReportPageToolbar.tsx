import { useState } from "react";
import { Button } from "@erp/ui";
import { Settings2 } from "lucide-react";
import { ColumnConfigDialog } from "./ColumnConfigDialog/ColumnConfigDialog";
import { ReportExportButtons } from "./ReportExportButtons/ReportExportButtons";

export function ReportPageToolbar() {
  const [configOpen, setConfigOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <ReportExportButtons />

      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-9 w-9"
        aria-label="Thiết lập cột hiển thị"
        onClick={() => setConfigOpen(true)}
      >
        <Settings2 className="h-4 w-4" />
      </Button>

      <ColumnConfigDialog open={configOpen} onClose={() => setConfigOpen(false)} />
    </div>
  );
}
