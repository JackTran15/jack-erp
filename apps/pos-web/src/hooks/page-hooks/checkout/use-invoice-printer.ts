import { useMemo } from "react";
import { BrowserWindowInvoicePrinter } from "@erp/pos/lib/page-libs/checkout/printing/BrowserWindowInvoicePrinter";
import type { InvoicePrinter } from "@erp/pos/lib/page-libs/checkout/printing/InvoicePrinter";

/**
 * Module-level override. Production code can inject a different printer
 * (thermal, PDF service, etc.) once at app boot via `setDefaultInvoicePrinter`
 * and every consumer of `useInvoicePrinter` picks it up automatically.
 */
let defaultPrinter: InvoicePrinter | null = null;

/** Replace the global printer used when no per-call override is supplied. */
export function setDefaultInvoicePrinter(printer: InvoicePrinter | null): void {
  defaultPrinter = printer;
}

/**
 * Resolve the printer to use:
 *  1. An explicit `override` (per-call DI, e.g. tests).
 *  2. The module-level `defaultPrinter` (set at app boot).
 *  3. A fresh `BrowserWindowInvoicePrinter` (the safe fallback).
 *
 * Memoized so consumers can rely on referential stability for effects /
 * dependency arrays.
 */
export function useInvoicePrinter(override?: InvoicePrinter): InvoicePrinter {
  return useMemo<InvoicePrinter>(
    () => override ?? defaultPrinter ?? new BrowserWindowInvoicePrinter(),
    [override],
  );
}
