import type { ReturnInvoiceRow } from "@erp/pos/interfaces/return-goods.interface";

/**
 * Static seed data used while the feature is mocked. Real wiring will replace
 * this with a TanStack Query hook hitting the invoice service.
 */
export function getMockReturnInvoices(): ReturnInvoiceRow[] {
  const today = new Date();
  today.setHours(0, 24, 0, 0);
  const earlier = new Date(today);
  earlier.setMinutes(earlier.getMinutes() - 8);

  return [
    {
      id: "2605010015",
      invoiceNumber: "2605010015",
      createdAt: today,
      customerName: "",
      customerPhone: "",
      totalAmount: 1_350_000,
      branchName: "Giày MT Cần Thơ",
      items: [
        {
          id: "MY3007-D-35",
          code: "MY3007-D-35",
          name: "Dép nữ MY3007-D-35",
          unitPrice: 850_000,
          allowedQty: 1,
        },
        {
          id: "AKCV19837-D-41",
          code: "AKCV19837-D-41",
          name: "Giày nam AKCV19837-D-41",
          unitPrice: 500_000,
          allowedQty: 1,
        },
      ],
    },
    {
      id: "2605010014",
      invoiceNumber: "2605010014",
      createdAt: earlier,
      customerName: "duc anh",
      customerPhone: "3662272727",
      totalAmount: 695_000,
      branchName: "Giày MT Cần Thơ",
      items: [
        {
          id: "BS112-W-38",
          code: "BS112-W-38",
          name: "Giày nữ BS112-W-38",
          unitPrice: 695_000,
          allowedQty: 1,
        },
      ],
    },
  ];
}
