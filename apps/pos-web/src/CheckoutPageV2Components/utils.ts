/** Format integer VND (Vietnamese grouping with `.`), no currency symbol. */
export function formatVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN").format(Math.round(amount));
}

/** Join class names, filtering out falsy values. Tiny stand-in for clsx. */
export function cx(
  ...args: Array<string | false | null | undefined>
): string {
  return args.filter(Boolean).join(" ");
}
