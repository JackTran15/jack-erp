import { FormShellDialogRoot } from "./FormShellDialogRoot";
import { FormShellDialogBody } from "./FormShellDialogBody";
import { FormShellDialogSlot } from "./FormShellDialogSlot";
import { FormShellDialogFormBlock } from "./FormShellDialogFormBlock";
import { FormShellDialogCollapseBar } from "./FormShellDialogCollapseBar";
import { FormShellDialogTwoPane, FormShellDialogPane } from "./FormShellDialogTwoPane";
import { FormShellDialogSectionHeading } from "./FormShellDialogSectionHeading";
import { FormShellDialogDetailRegion } from "./FormShellDialogDetailRegion";
import { FormShellDialogScrollPane } from "./FormShellDialogScrollPane";
import { FORM_SHELL_SECTION_LABELS } from "./form-shell-dialog.constants";

export type { FormShellDialogRootProps } from "./FormShellDialogRoot";
export type { FormShellDialogBodyProps } from "./FormShellDialogBody";
export type { FormShellDialogSlotProps } from "./FormShellDialogSlot";
export type { FormShellDialogFormBlockProps } from "./FormShellDialogFormBlock";
export type { FormShellDialogCollapseBarProps } from "./FormShellDialogCollapseBar";
export type {
  FormShellDialogTwoPaneProps,
  FormShellDialogPaneProps,
} from "./FormShellDialogTwoPane";
export type { FormShellDialogSectionHeadingProps } from "./FormShellDialogSectionHeading";
export type { FormShellDialogDetailRegionProps } from "./FormShellDialogDetailRegion";
export type { FormShellDialogScrollPaneProps } from "./FormShellDialogScrollPane";

export { FORM_SHELL_SECTION_LABELS };

export function FormShellDialog(
  props: import("./FormShellDialogRoot").FormShellDialogRootProps,
) {
  return <FormShellDialogRoot {...props} />;
}

FormShellDialog.Root = FormShellDialogRoot;
FormShellDialog.Body = FormShellDialogBody;
FormShellDialog.Slot = FormShellDialogSlot;
FormShellDialog.FormBlock = FormShellDialogFormBlock;
FormShellDialog.CollapseBar = FormShellDialogCollapseBar;
FormShellDialog.TwoPane = FormShellDialogTwoPane;
FormShellDialog.Pane = FormShellDialogPane;
FormShellDialog.SectionHeading = FormShellDialogSectionHeading;
FormShellDialog.DetailRegion = FormShellDialogDetailRegion;
FormShellDialog.ScrollPane = FormShellDialogScrollPane;
