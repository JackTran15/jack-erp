import type { ToolbarAction, ToolbarActionOption, ToolbarItem } from "@erp/ui";
import { TOOLBAR_REGISTRY, type ToolbarActionId } from "../../constants";

export type ListToolbarSpec =
  | { action: ToolbarActionId; hidden: true }
  | {
      action: ToolbarActionId;
      onClick: () => void;
      disabled?: boolean;
      /** Override default label (e.g. "Thêm dòng" instead of "Thêm mới"). */
      label?: string;
      variant?: ToolbarAction["variant"];
      options?: ToolbarActionOption[];
    };

function isHiddenSpec(spec: ListToolbarSpec): spec is { action: ToolbarActionId; hidden: true } {
  return "hidden" in spec && spec.hidden === true;
}

/**
 * Builds `ToolbarItem[]` for {@link PageToolbar} from declarative specs.
 * Skips entries with `hidden: true`.
 */
export function buildListToolbar(specs: ListToolbarSpec[]): ToolbarItem[] {
  const items: ToolbarItem[] = [];
  for (const spec of specs) {
    if (isHiddenSpec(spec)) continue;
    const base = TOOLBAR_REGISTRY[spec.action];
    items.push({
      id: base.id,
      label: spec.label ?? base.label,
      icon: base.icon,
      onClick: spec.onClick,
      disabled: spec.disabled,
      variant: spec.variant ?? ("variant" in base ? base.variant : undefined),
      options: spec.options,
    });
  }
  return items;
}
