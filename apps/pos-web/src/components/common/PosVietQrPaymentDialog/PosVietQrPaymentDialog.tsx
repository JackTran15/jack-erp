import { useRef } from "react";
import QRCode from "react-qr-code";
import { PosDialog } from "@erp/pos/components/common/PosDialog/PosDialog";
import { PrinterIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { formatVnd } from "@erp/ui";

export interface QrPaymentInfo {
  /** Account holder name — uppercase string shown above the account row. */
  holderName: string;
  /** Bank account number printed below the holder name. */
  accountNumber: string;
  /** Short bank code (e.g. "VIB", "VCB", "TCB"). */
  bankCode: string;
  /** Optional amount used to derive QR payload + receipt header text. */
  amount?: number;
  /** Optional transfer note encoded into the QR payload. */
  note?: string;
}

export interface PosVietQrPaymentDialogProps {
  open: boolean;
  onClose: () => void;
  payment: QrPaymentInfo;
}

const QR_SIZE = 192;

/** Build a representative QR payload — replaced when wired to a real VietQR service. */
function buildQrPayload(payment: QrPaymentInfo): string {
  const parts = [
    `BANK:${payment.bankCode}`,
    `ACCOUNT:${payment.accountNumber}`,
    `NAME:${payment.holderName}`,
  ];
  if (typeof payment.amount === "number" && payment.amount > 0) {
    parts.push(`AMOUNT:${Math.round(payment.amount)}`);
  }
  if (payment.note) parts.push(`NOTE:${payment.note}`);
  return parts.join("|");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Open a hidden iframe containing only the QR card, then trigger the browser
 * print dialog. The iframe is removed once printing finishes so the main page
 * stays untouched and only the QR area lands on paper.
 */
function printQrSection(qrSvg: string, payment: QrPaymentInfo) {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  const amountLine =
    typeof payment.amount === "number" && payment.amount > 0
      ? `<div class="amount">Số tiền: ${formatVnd(payment.amount)} đ</div>`
      : "";
  const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<title>Mã VietQR thanh toán</title>
<style>
  @page { size: auto; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; background: #ffffff; color: #1f2937;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  .wrap { display: flex; justify-content: center; padding: 24px; }
  .card {
    width: 280px; border: 1px solid #e5e7eb; border-radius: 12px;
    padding: 16px 12px; text-align: center;
  }
  .title { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #1f2937; }
  .holder { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; color: #4b5563; text-transform: uppercase; }
  .acct { display: flex; justify-content: center; align-items: center; gap: 10px; font-size: 12px; color: #4b5563; margin-top: 4px; }
  .acct .divider { width: 1px; height: 12px; background: #e5e7eb; }
  .brand { font-size: 16px; font-weight: 700; color: #1b4f9e; margin: 14px 0 8px 0; letter-spacing: 0.01em; }
  .qr { display: flex; justify-content: center; }
  .qr svg { width: ${QR_SIZE}px; height: ${QR_SIZE}px; }
  .amount { margin-top: 10px; font-size: 13px; font-weight: 600; color: #1f2937; }
  .footer { margin-top: 12px; padding-top: 10px; border-top: 1px dashed #e5e7eb; font-size: 11px; color: #1b4f9e; font-weight: 600; letter-spacing: 0.02em; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="title">Mã VietQR thanh toán</div>
      <div class="holder">${escapeHtml(payment.holderName)}</div>
      <div class="acct">
        <span>${escapeHtml(payment.accountNumber)}</span>
        <span class="divider"></span>
        <span>${escapeHtml(payment.bankCode)}</span>
      </div>
      <div class="brand">VietQR</div>
      <div class="qr">${qrSvg}</div>
      ${amountLine}
      <div class="footer">napas 247</div>
    </div>
  </div>
</body>
</html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";
  document.body.appendChild(iframe);

  const cleanup = () => {
    if (iframe.isConnected) iframe.remove();
  };

  const triggerPrint = () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    win.onafterprint = cleanup;
    try {
      win.focus();
      win.print();
    } catch {
      cleanup();
      return;
    }
    // Safety fallback: some browsers do not fire onafterprint.
    setTimeout(cleanup, 60_000);
  };

  iframe.onload = triggerPrint;
  const doc = iframe.contentDocument ?? iframe.contentWindow?.document;
  if (!doc) {
    cleanup();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  if (iframe.contentDocument?.readyState === "complete") triggerPrint();
}

/**
 * VietQR payment modal — opened from `QrPaymentButton`. Re-uses `PosDialog`
 * for the shell; renders a decorative QR card and a green "In mã QR" CTA
 * that prints only the QR section via a hidden iframe (so the rest of the
 * POS page never lands on paper).
 */
export function PosVietQrPaymentDialog({
  open,
  onClose,
  payment,
}: PosVietQrPaymentDialogProps) {
  const qrWrapperRef = useRef<HTMLDivElement>(null);
  const value = buildQrPayload(payment);

  const handlePrint = () => {
    const svg = qrWrapperRef.current?.querySelector("svg");
    if (!svg) return;
    printQrSection(svg.outerHTML, payment);
  };

  return (
    <PosDialog
      open={open}
      onClose={onClose}
      width={360}
      contentClassName="max-w-[95vw]"
    >
      <PosDialog.Header
        title="Mã VietQR thanh toán"
        titleClassName="text-[16px]"
      />
      <PosDialog.Body className="p-5">
        <div className="relative mx-auto w-[280px]">
          {/* Decorative VietQR brand corners — blue peeks bottom-right,
              green peeks top-left, white card sits on top. */}
          <span
            aria-hidden
            className="absolute rounded-[14px] bg-[#1B4F9E]"
            style={{ inset: "8px -8px -8px 8px" }}
          />
          <span
            aria-hidden
            className="absolute rounded-[14px] bg-[#2E9A4A]"
            style={{ inset: "-4px 8px 12px -8px" }}
          />

          {/* White content card on top of the decorative shapes */}
          <div className="relative z-[1] rounded-xl bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
            <div className="flex flex-col items-center gap-1 pb-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-[#4B5563]">
                {payment.holderName}
              </p>
              <div className="flex items-center gap-2 text-[12px] text-[#4B5563]">
                <span>{payment.accountNumber}</span>
                <span className="h-3 w-px bg-[#E5E7EB]" />
                <span>{payment.bankCode}</span>
              </div>
            </div>

            <div className="flex justify-center pt-2 pb-1 text-[18px] font-bold tracking-tight text-[#1B4F9E]">
              VietQR
            </div>

            <div
              ref={qrWrapperRef}
              className="mx-auto flex items-center justify-center rounded-md bg-white p-2"
              style={{ width: QR_SIZE + 16, height: QR_SIZE + 16 }}
            >
              <QRCode
                value={value}
                size={QR_SIZE}
                level="H"
                bgColor="#FFFFFF"
                fgColor="#000000"
              />
            </div>

            {typeof payment.amount === "number" && payment.amount > 0 ? (
              <p className="mt-2 text-center text-[13px] font-semibold text-gray-900">
                {formatVnd(payment.amount)} đ
              </p>
            ) : null}

            <div className="mt-3 flex items-center justify-center border-t border-dashed border-[#E5E7EB] pt-2 text-[11px] font-semibold tracking-wide text-[#1B4F9E]">
              napas 247
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handlePrint}
          className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#2E7D32] px-6 text-[14px] font-medium text-white transition-colors hover:bg-[#256628] active:bg-[#1F5223] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#66BB6A] focus-visible:ring-offset-2"
        >
          <PrinterIcon size={16} className="text-white" />
          In mã QR
        </button>
      </PosDialog.Body>
    </PosDialog>
  );
}
