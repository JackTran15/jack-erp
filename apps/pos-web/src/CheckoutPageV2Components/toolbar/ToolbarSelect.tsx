import type { ReactNode } from "react";
import { DropdownButton } from "../common/DropdownButton";
import { KeyboardHint } from "../common/KeyboardHint";

export interface ToolbarSelectProps {
  /** Visible placeholder, e.g. "NV bán hàng". */
  placeholder: string;
  /** Selected value (when empty, placeholder shows). */
  value?: string;
  /** Optional shortcut hint, e.g. "Alt + N". */
  shortcut?: string;
  leadingIcon?: ReactNode;
  onClick?: () => void;
  className?: string;
}

/**
 * Dropdown trigger with placeholder + optional shortcut hint inline,
 * matching Sapo POS's "(Alt + N) NV bán hàng ▾" / "(Alt + B) Chọn bảng giá ▾".
 */
export function ToolbarSelect({
  placeholder,
  value,
  shortcut,
  leadingIcon,
  onClick,
  className,
}: ToolbarSelectProps) {
  return (
    <DropdownButton
      onClick={onClick}
      leading={leadingIcon}
      className={className}
    >
      {value ? (
        <span>{value}</span>
      ) : (
        <span className="text-gray-400">
          {shortcut ? <KeyboardHint>({shortcut}) </KeyboardHint> : null}
          {placeholder}
        </span>
      )}
    </DropdownButton>
  );
}
