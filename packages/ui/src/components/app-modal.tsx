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
  showFooter?: boolean;
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
  allowFullscreen = true,
  showFooter = true,
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
        className={cn(
          "flex flex-col max-h-[90vh]",
          fullscreen && "h-screen w-screen max-h-none",
          !fullscreen && className,
        )}
      >
        <DialogHeader className="flex-shrink-0">
          <div className="space-y-1 pr-16">
            <DialogTitle>{title}</DialogTitle>
            {description ? (
              <DialogDescription>{description}</DialogDescription>
            ) : null}
          </div>
        </DialogHeader>
        {allowFullscreen ? (
          <button
            type="button"
            className="absolute right-12 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
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
        <div className="flex-1 overflow-auto py-2">{children}</div>
        {showFooter ? (
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
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
AppModal.displayName = "AppModal";

export { AppModal };
