import * as React from "react";
import { AppModal, AppModalProps } from "@erp/ui";

export type FormShellDialogRootProps = AppModalProps;

export function FormShellDialogRoot({
  children,
  defaultWidth = 920,
  defaultHeight = 720,
  minWidth = 680,
  minHeight = 520,
  bodyClassName = "overflow-hidden pb-4",
  showFooter = false,
  ...props
}: FormShellDialogRootProps) {
  return (
    <AppModal
      defaultWidth={defaultWidth}
      defaultHeight={defaultHeight}
      minWidth={minWidth}
      minHeight={minHeight}
      showFooter={showFooter}
      bodyClassName={bodyClassName}
      {...props}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden pr-1">
        {children}
      </div>
    </AppModal>
  );
}
