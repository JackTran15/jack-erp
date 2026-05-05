import type { ReactNode } from "react";
import { cx } from "../utils";

export interface KeyboardHintProps {
  children: ReactNode;
  className?: string;
}

/**
 * Inline shortcut hint, e.g. "(F9)" or "(Alt + N)".
 * Renders muted gray text — consistent across all toolbar / button labels.
 */
export function KeyboardHint({ children, className }: KeyboardHintProps) {
  return (
    <span className={cx("text-gray-400 font-normal", className)}>
      {children}
    </span>
  );
}
