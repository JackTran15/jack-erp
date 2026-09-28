import type { EInvoiceTab } from "../../../pages/settings/einvoice/_lib/einvoice.interface";

export const EINVOICE_TABS: { id: EInvoiceTab; label: string }[] = [
  { id: "unissued", label: "Hóa đơn chưa phát hành" },
  { id: "issued", label: "Hóa đơn đã phát hành" },
];

export const EINVOICE_DEFAULT_PAGE_SIZE = 50;

export const EINVOICE_STORE_KEY = "bo-einvoice-page";
