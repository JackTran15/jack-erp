import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from "@erp/ui";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useBarcodePrintSettingsStore } from "../../../../store/page-stores/inventory-item-barcodes/barcode-print-settings.store";
import { PaperStepperInput } from "./PaperStepperInput/PaperStepperInput";

/** Nhóm "Tùy chỉnh giấy in": căn lề + kích thước khổ giấy + cột tem (mm). */
export function PaperCustomizationSection() {
  const [open, setOpen] = useState(true);
  const paper = useBarcodePrintSettingsStore((s) => s.paper);
  const setPaper = useBarcodePrintSettingsStore((s) => s.setPaper);
  const resetPaper = useBarcodePrintSettingsStore((s) => s.resetPaper);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
        Tùy chỉnh giấy in
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-4 pt-3">
          <div>
            <p className="mb-2 text-sm font-bold text-foreground">
              Căn lề khổ giấy (mm)
            </p>
            <div className="grid grid-cols-4 gap-2">
              <PaperStepperInput
                label="Trên"
                value={paper.marginTop}
                step={0.05}
                onChange={(v) => setPaper({ marginTop: v })}
              />
              <PaperStepperInput
                label="Dưới"
                value={paper.marginBottom}
                step={0.05}
                onChange={(v) => setPaper({ marginBottom: v })}
              />
              <PaperStepperInput
                label="Trái"
                value={paper.marginLeft}
                step={0.05}
                onChange={(v) => setPaper({ marginLeft: v })}
              />
              <PaperStepperInput
                label="Phải"
                value={paper.marginRight}
                step={0.05}
                onChange={(v) => setPaper({ marginRight: v })}
              />
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-bold text-foreground">
              Kích thước khổ giấy (mm)
            </p>
            <div className="grid grid-cols-2 gap-2">
              <PaperStepperInput
                label="Cao"
                value={paper.paperHeight}
                onChange={(v) => setPaper({ paperHeight: v })}
              />
              <PaperStepperInput
                label="Rộng"
                value={paper.paperWidth}
                onChange={(v) => setPaper({ paperWidth: v })}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 items-end gap-2">
            <PaperStepperInput
              label="Độ rộng cột"
              value={paper.columnWidth}
              onChange={(v) => setPaper({ columnWidth: v })}
            />
            <PaperStepperInput
              label="Khoảng cách cột"
              value={paper.columnGap}
              step={0.05}
              onChange={(v) => setPaper({ columnGap: v })}
            />
            <Button
              type="button"
              variant="outline"
              className="h-8 whitespace-nowrap text-primary"
              onClick={resetPaper}
            >
              Lấy lại mặc định
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
