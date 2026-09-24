import { describe, expect, it } from "vitest";
import type { SalesOrderDto } from "./order-mapper";
import { toOrderLineRows, toOrderRow } from "./order-mapper";

/**
 * `toOrderRow` là chỗ duy nhất biết cả hai hình dạng, nên nó cũng là chỗ duy
 * nhất vỡ khi API thiếu trường. Hai hình dạng THẬT mà `/mobile/sales-orders`
 * đang trả: đơn mobile cũ (không người nhận, không địa chỉ giao, không phí
 * giao) và đơn web sau T-05-07 (đủ 8 trường mới).
 */

/** `YYYY-MM-DD` theo giờ địa phương — oracle độc lập, không phụ thuộc TZ máy chạy. */
function localIsoDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA");
}

describe("toOrderRow — đơn mobile cũ (thiếu trường)", () => {
  const mobileOrder: SalesOrderDto = {
    id: "ord-mobile-1",
    code: "SO-0001",
    status: "SENT",
    createdAt: "2026-09-21T03:15:00.000Z",
    salespersonName: "Nguyễn Văn A",
    salesChannel: "MOBILE",
    customerName: "Trần Thị B",
    customerPhone: "0901234567",
    amountDue: "1250000.00",
    note: "Giao giờ hành chính",
    invoiceCode: null,
    lines: [],
  };

  it("maps an order with no recipient / no ship_* / no shippingFee without throwing", () => {
    expect(() => toOrderRow(mobileOrder)).not.toThrow();
  });

  it("falls back to the customer as recipient and leaves shipping empty", () => {
    const row = toOrderRow(mobileOrder);

    expect(row.recipientName).toBe("Trần Thị B");
    expect(row.recipientPhone).toBe("0901234567");
    expect(row.shippingAddress).toBe("");
    expect(row.shippingFeeCustomer).toBe(0);
  });

  it("maps status to its Vietnamese label and always reports 'Đặt hàng'", () => {
    const row = toOrderRow(mobileOrder);

    expect(row.paymentStatus).toBe("Chờ xử lý");
    expect(row.orderType).toBe("Đặt hàng");
  });

  it("keeps the 8 columns without backing empty, not undefined", () => {
    const row = toOrderRow(mobileOrder);

    expect(row.shippingPartner).toBe("");
    expect(row.carrierStatus).toBe("");
    expect(row.trackingCode).toBe("");
    expect(row.marketplaceOrderCode).toBe("");
    expect(row.packageInfo).toBe("");
    expect(row.reconciliationSlip).toBe("");
    expect(row.reconciliationStatus).toBe("");
    expect(row.shippingFeePartner).toBe(0);
    expect(row.tags).toEqual([]);
  });

  it("maps a DTO carrying nothing but an id to empty strings / zeros", () => {
    const row = toOrderRow({ id: "ord-bare" });

    expect(row).toMatchObject({
      id: "ord-bare",
      createdDate: "",
      deliveryDate: "",
      invoiceDate: "",
      paymentStatus: "",
      invoiceCode: "",
      salesStaff: "",
      recipientName: "",
      recipientPhone: "",
      shippingAddress: "",
      shippingFeeCustomer: 0,
      totalAmount: 0,
      salesChannel: "",
      note: "",
      cod: 0,
    });
  });
});

describe("toOrderRow — đơn web đủ 8 trường mới (T-05-07)", () => {
  const webOrder: SalesOrderDto = {
    id: "ord-web-1",
    code: "SO-0002",
    status: "PROCESSED",
    createdAt: "2026-09-21T03:15:00.000Z",
    salespersonName: "Lê Văn C",
    salesChannel: "WEB",
    customerName: "Khách lẻ",
    customerPhone: "0900000000",
    amountDue: 1234567,
    note: "",
    invoiceCode: "HD-0009",
    recipientName: "Phạm Thị D",
    recipientPhone: "0988888888",
    shipAddressLine: "12 Nguyễn Huệ",
    shipWardName: "Phường Bến Nghé",
    shipProvinceName: "TP. Hồ Chí Minh",
    shippingFee: "30000.00",
    lines: [],
  };

  it("carries recipient, address snapshot and shipping fee through", () => {
    const row = toOrderRow(webOrder);

    expect(row.recipientName).toBe("Phạm Thị D");
    expect(row.recipientPhone).toBe("0988888888");
    expect(row.shippingAddress).toBe(
      "12 Nguyễn Huệ, Phường Bến Nghé, TP. Hồ Chí Minh",
    );
    expect(row.shippingFeeCustomer).toBe(30000);
  });

  it("prefers the order's own recipient over the customer", () => {
    const row = toOrderRow(webOrder);

    expect(row.recipientName).not.toBe("Khách lẻ");
    expect(row.recipientPhone).not.toBe("0900000000");
  });

  it("joins only the address parts that are present", () => {
    expect(
      toOrderRow({ ...webOrder, shipWardName: null, shipAddressLine: "   " })
        .shippingAddress,
    ).toBe("TP. Hồ Chí Minh");
  });
});

describe("toOrderRow — tiền và ngày", () => {
  // T-05-04 đổi hợp đồng của `cod` CÓ CHỦ ĐÍCH: renderer của cột từ `text`
  // sang `money`, nên mapper phải trả SỐ THÔ và để cột định dạng. Ba assert
  // dưới đây trước kia kỳ vọng chuỗi đã định dạng — chúng đổi vì hành vi đổi,
  // không phải vì hồi quy. Định dạng sẵn ở mapper sẽ làm dòng tổng
  // (`summary: "sum"` trên cột Thu hộ) cộng chuỗi thay vì cộng tiền.
  it("trả cod là SỐ để cột money định dạng, không phải chuỗi đã định dạng", () => {
    expect(toOrderRow({ id: "o", amountDue: 1234567 }).cod).toBe(1234567);
    expect(toOrderRow({ id: "o", amountDue: "1250000.00" }).cod).toBe(1250000);
    expect(toOrderRow({ id: "o" }).cod).toBe(0);
  });

  it("cod và totalAmount đều là số — Thu hộ cộng được ở dòng tổng", () => {
    const row = toOrderRow({ id: "o", amountDue: "1250000.00" });

    expect(row.totalAmount).toBe(1250000);
    expect(typeof row.cod).toBe("number");
    // "Thu hộ" = số shipper phải thu = amount_due (A-17), đã gồm phí giao.
    expect(row.cod).toBe(row.totalAmount);
  });

  it("treats an unparsable numeric as 0", () => {
    expect(toOrderRow({ id: "o", amountDue: "n/a" }).totalAmount).toBe(0);
  });

  it("derives createdDate from the local calendar day, not the UTC slice", () => {
    const iso = "2026-09-20T17:30:00.000Z";

    expect(toOrderRow({ id: "o", createdAt: iso }).createdDate).toBe(
      localIsoDate(iso),
    );
  });

  it("leaves createdDate empty for a missing or invalid timestamp", () => {
    expect(toOrderRow({ id: "o" }).createdDate).toBe("");
    expect(toOrderRow({ id: "o", createdAt: null }).createdDate).toBe("");
    expect(toOrderRow({ id: "o", createdAt: "hôm qua" }).createdDate).toBe("");
  });

  it("does not invent an invoice code or invoice/delivery date", () => {
    // Đường danh sách không tra hoá đơn — `invoiceCode` luôn null ở đây.
    const row = toOrderRow({ id: "o", invoiceCode: null });

    expect(row.invoiceCode).toBe("");
    expect(row.invoiceDate).toBe("");
    expect(row.deliveryDate).toBe("");
  });
});

describe("toOrderLineRows", () => {
  it("returns an empty list when lines are absent or null", () => {
    expect(toOrderLineRows({ id: "o" })).toEqual([]);
    expect(toOrderLineRows({ id: "o", lines: null })).toEqual([]);
  });

  it("reads the line code as sku and coerces numeric strings", () => {
    const [line] = toOrderLineRows({
      id: "o",
      lines: [
        {
          id: "l1",
          code: "SP-001",
          name: "Giày da",
          unit: "Đôi",
          quantity: "2",
          unitPrice: "450000.00",
          lineTotal: "900000.00",
        },
      ],
    });

    expect(line).toEqual({
      sku: "SP-001",
      name: "Giày da",
      unit: "Đôi",
      quantity: 2,
      unitPrice: 450000,
      amount: 900000,
    });
  });

  it("maps a line with nothing set to empty strings / zeros", () => {
    expect(toOrderLineRows({ id: "o", lines: [{}] })).toEqual([
      { sku: "", name: "", unit: "", quantity: 0, unitPrice: 0, amount: 0 },
    ]);
  });
});

describe("toOrderRow — nhãn duyệt ở chi nhánh (T-11-06)", () => {
  const webOrder: SalesOrderDto = {
    id: "ord-web-confirm",
    code: "DT000999",
    status: "SENT",
    createdAt: "2026-09-24T03:15:00.000Z",
    salesChannel: "WEB",
    needsConfirmation: true,
    confirmedAt: null,
    lines: [],
  };

  it("marks a SENT web order as waiting for confirmation", () => {
    const row = toOrderRow(webOrder);
    expect(row.needsConfirmation).toBe(true);
    expect(row.confirmedAt).toBeNull();
  });

  it("keeps confirmedAt on a SENT web order already confirmed", () => {
    const row = toOrderRow({ ...webOrder, confirmedAt: "2026-09-24T04:00:00.000Z" });
    expect(row.needsConfirmation).toBe(true);
    expect(row.confirmedAt).toBe("2026-09-24T04:00:00.000Z");
  });

  it("does not ask to confirm a web order that was already processed", () => {
    const row = toOrderRow({ ...webOrder, status: "PROCESSED" });
    expect(row.needsConfirmation).toBe(false);
  });

  it("does not ask to confirm a salesperson (mobile) order", () => {
    const row = toOrderRow({ ...webOrder, salesChannel: "MOBILE", needsConfirmation: false });
    expect(row.needsConfirmation).toBe(false);
  });

  it("carries no confirmation keys for an admin DTO without needsConfirmation", () => {
    const { needsConfirmation: _omit, ...adminDto } = webOrder;
    const row = toOrderRow({ ...adminDto, confirmedAt: "2026-09-24T04:00:00.000Z" });
    expect("needsConfirmation" in row).toBe(false);
    expect("confirmedAt" in row).toBe(false);
  });
});
