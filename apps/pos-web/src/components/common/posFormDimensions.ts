/** Shared row-control scale for POS form atoms (each component owns variant chrome locally). */
export type PosFormSize = "sm" | "md" | "lg" | "xl";

export const posFormHeight: Record<PosFormSize, string> = {
  sm: "h-7",
  md: "h-9",
  lg: "h-10",
  xl: "h-11",
};

export const posFormRadius: Record<PosFormSize, string> = {
  sm: "rounded",
  md: "rounded-md",
  lg: "rounded-md",
  xl: "rounded-md",
};

export const posFormPadX: Record<PosFormSize, string> = {
  sm: "px-2",
  md: "px-2.5",
  lg: "px-3",
  xl: "px-3.5",
};

/** Classes for the native field inside a sized wrapper. */
export const posFormFieldClass =
  "min-w-0 flex-1 bg-transparent text-sm text-gray-900 focus:outline-none";

/** Wrapper layout shared by comboboxes, text rows, selects. */
export const posFormRowClass =
  "relative inline-flex w-full min-w-0 items-center gap-1";

export function posFormUnderlineShadow(
  invalid?: boolean,
  open?: boolean,
): string {
  if (invalid) return "shadow-[inset_0_-2px_0_0_#F87171]";
  if (open) return "shadow-[inset_0_-2px_0_0_#5B5BD6]";
  return "shadow-[inset_0_-1px_0_0_#E5E7EB] focus-within:shadow-[inset_0_-2px_0_0_#5B5BD6]";
}

/** Horizontal {@link PosFormItem} label offset when `alignTop` matches control height. */
export const posFormItemLabelTopPad: Record<PosFormSize, string> = {
  sm: "pt-0.5",
  md: "pt-2",
  lg: "pt-2.5",
  xl: "pt-3",
};
