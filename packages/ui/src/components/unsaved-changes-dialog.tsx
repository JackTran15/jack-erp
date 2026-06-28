import * as React from "react";
import { HelpCircle, Save, FileX, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./dialog";
import { Button } from "./button";

export type UnsavedChangesChoice = "save" | "discard" | "cancel";

export interface UnsavedChangesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user picks an action. The dialog will close after. */
  onChoose: (choice: UnsavedChangesChoice) => void;
  title?: string;
  message?: string;
  saveLabel?: string;
  discardLabel?: string;
  cancelLabel?: string;
  saveDisabled?: boolean;
}

/**
 * Three-way confirmation shown when the user tries to leave/close a form
 * that has unsaved edits. Returns "save" | "discard" | "cancel".
 */
export function UnsavedChangesDialog({
  open,
  onOpenChange,
  onChoose,
  title = "Dữ liệu chưa được lưu",
  message = "Dữ liệu đã thay đổi, bạn có muốn lưu không?",
  saveLabel = "Lưu",
  discardLabel = "Không lưu",
  cancelLabel = "Hủy bỏ",
  saveDisabled,
}: UnsavedChangesDialogProps) {
  const handle = (c: UnsavedChangesChoice) => () => {
    onChoose(c);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-3 p-5" showCloseButton>
        <DialogTitle className="text-base">{title}</DialogTitle>
        <div className="flex items-start gap-3 py-2">
          <HelpCircle className="mt-0.5 h-7 w-7 shrink-0 text-primary" />
          <DialogDescription asChild>
            <p className="text-sm text-foreground">{message}</p>
          </DialogDescription>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button
            className="!bg-primary-blue !text-white hover:!bg-primary-blue-hover"
            onClick={handle("save")}
            disabled={saveDisabled}
          >
            <Save className="mr-1.5 h-4 w-4" />
            {saveLabel}
          </Button>
          <Button variant="outline" onClick={handle("discard")}>
            <FileX className="mr-1.5 h-4 w-4" />
            {discardLabel}
          </Button>
          <Button variant="ghost" onClick={handle("cancel")}>
            <X className="mr-1.5 h-4 w-4" />
            {cancelLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
