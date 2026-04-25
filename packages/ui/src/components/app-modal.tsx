import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "./dialog";
import { Button } from "./button";
import { cn } from "../lib/utils";
import { Maximize2, Minimize2 } from "lucide-react";

export interface AppModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  onSave?: () => void;
  onCancel?: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  saveDisabled?: boolean;
  allowFullscreen?: boolean;
  className?: string;
}

function AppModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSave,
  onCancel,
  saveLabel = "Lưu",
  cancelLabel = "Huỷ",
  saveDisabled,
  allowFullscreen = false,
  className,
}: AppModalProps) {
  const [fullscreen, setFullscreen] = React.useState(false);

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        fullscreen={fullscreen}
        className={cn("flex flex-col max-h-[90vh]", fullscreen && "max-h-full", className)}
      >
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1 flex-1">
              <DialogTitle>{title}</DialogTitle>
              {description ? (
                <DialogDescription>{description}</DialogDescription>
              ) : null}
            </div>
            {allowFullscreen ? (
              <button
                type="button"
                className="rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setFullscreen((f) => !f)}
                aria-label={fullscreen ? "Thu nhỏ" : "Toàn màn hình"}
              >
                {fullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </button>
            ) : null}
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-auto py-2">{children}</div>
        <DialogFooter className="flex-shrink-0 gap-2 sm:gap-2">
          {onCancel || !onSave ? (
            <DialogClose asChild>
              <Button variant="outline" onClick={handleCancel}>
                {cancelLabel}
              </Button>
            </DialogClose>
          ) : null}
          {onSave ? (
            <Button onClick={onSave} disabled={saveDisabled}>
              {saveLabel}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
AppModal.displayName = "AppModal";

export { AppModal };
