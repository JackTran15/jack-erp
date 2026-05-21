import * as React from "react";

export interface FormShellDialogCollapseContextValue {
  collapsed: boolean;
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}

const CollapseContext =
  React.createContext<FormShellDialogCollapseContextValue | null>(null);

export function FormShellDialogCollapseProvider({
  value,
  children,
}: {
  value: FormShellDialogCollapseContextValue;
  children: React.ReactNode;
}) {
  return (
    <CollapseContext.Provider value={value}>{children}</CollapseContext.Provider>
  );
}

export function useFormShellDialogCollapse() {
  const ctx = React.useContext(CollapseContext);
  if (!ctx) {
    throw new Error(
      "useFormShellDialogCollapse must be used within FormShellDialog.FormBlock",
    );
  }
  return ctx;
}
