import type { FormFieldProps } from "@erp/ui";

export const DIALOG_FORM_LABEL_WIDTH = "8.75rem";

export const DIALOG_FORM_FIELD_PROPS: Pick<
  FormFieldProps,
  "layout" | "labelWidth"
> = {
  layout: "horizontal",
  labelWidth: DIALOG_FORM_LABEL_WIDTH,
};

export const DIALOG_FORM_STACK_CLASS = "grid gap-3";
