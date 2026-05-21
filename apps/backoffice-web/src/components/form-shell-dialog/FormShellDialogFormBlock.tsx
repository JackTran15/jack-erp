import * as React from "react";
import { cn } from "@erp/ui";
import {
  FormShellDialogCollapseProvider,
  useFormShellDialogCollapse,
} from "./form-shell-dialog-collapse-context";
import { FormShellDialogCollapseBar } from "./FormShellDialogCollapseBar";

export interface FormShellDialogFormBlockProps {
  children: React.ReactNode;
  defaultCollapsed?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  showCollapseBar?: boolean;
  collapseLabel?: string;
  expandLabel?: string;
  className?: string;
  contentClassName?: string;
}

function FormBlockContent({
  children,
  showCollapseBar = true,
  collapseLabel,
  expandLabel,
  className,
  contentClassName,
}: Omit<
  FormShellDialogFormBlockProps,
  "defaultCollapsed" | "collapsed" | "onCollapsedChange"
>) {
  const { collapsed } = useFormShellDialogCollapse();

  return (
    <>
      {!collapsed ? (
        <div className={cn("shrink-0", className)}>
          <div className={contentClassName}>{children}</div>
        </div>
      ) : null}
      {showCollapseBar ? (
        <FormShellDialogCollapseBar
          collapseLabel={collapseLabel}
          expandLabel={expandLabel}
        />
      ) : null}
    </>
  );
}

export function FormShellDialogFormBlock({
  children,
  defaultCollapsed = false,
  collapsed: controlledCollapsed,
  onCollapsedChange,
  ...contentProps
}: FormShellDialogFormBlockProps) {
  const [uncontrolledCollapsed, setUncontrolledCollapsed] =
    React.useState(defaultCollapsed);

  const isControlled =
    controlledCollapsed !== undefined && onCollapsedChange !== undefined;

  const collapsed = isControlled ? controlledCollapsed : uncontrolledCollapsed;

  const setCollapsed = React.useCallback(
    (value: React.SetStateAction<boolean>) => {
      const next =
        typeof value === "function" ? value(collapsed) : value;
      if (isControlled) {
        onCollapsedChange!(next);
      } else {
        setUncontrolledCollapsed(next);
      }
    },
    [collapsed, isControlled, onCollapsedChange],
  );

  const collapseValue = React.useMemo(
    () => ({ collapsed, setCollapsed }),
    [collapsed, setCollapsed],
  );

  return (
    <FormShellDialogCollapseProvider value={collapseValue}>
      <FormBlockContent {...contentProps}>{children}</FormBlockContent>
    </FormShellDialogCollapseProvider>
  );
}
