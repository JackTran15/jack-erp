import { useState } from "react";
import { Button } from "@erp/ui";
import { CloudUpload, Printer, Settings2 } from "lucide-react";
import { ColumnConfigDialog } from "./ColumnConfigDialog/ColumnConfigDialog";

export function ReportPageToolbar() {
  const [configOpen, setConfigOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button type="button" variant="outline" size="sm">
        <Printer className="mr-1 h-4 w-4" />
        In
      </Button>

      <Button type="button" variant="outline" size="sm">
        <CloudUpload className="mr-1 h-4 w-4" />
        Xuất khẩu
      </Button>

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
