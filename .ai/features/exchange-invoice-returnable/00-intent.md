---
feature: exchange-invoice-returnable
slug: exchange-invoice-returnable
owner: Akenzy
created: 2026-08-22
status: draft
---

# Intent — Đổi trả theo hoá đơn trên hoá đơn đổi trả

## Problem

Khi khách đổi hàng và có **mua thêm** ("Mua thêm" / dòng OUT), POS ghi một hoá đơn
`type = EXCHANGE`. Hàng khách cầm về từ lần đổi đó là hàng **đã bán thật** — nó trừ
kho showroom, ăn giá vốn, sinh điểm tích luỹ, và khách đã trả tiền cho nó (bằng tiền
mặt hoặc bằng giá trị hàng trả lại).

Nhưng lần sau khách mang chính món hàng đó quay lại, thu ngân **không tìm thấy hoá
đơn đổi đó** ở màn hình `Đổi trả hàng`: danh sách chỉ liệt kê `type = SALE`. Cách duy
nhất còn lại là bấm **Đổi trả nhanh** — luồng không có hoá đơn gốc, nên hệ thống:

- hoàn theo **giá niêm yết** thay vì số tiền khách thực trả (không có gốc để prorate);
- không cộng dồn `returned_quantity`, nên khách có thể trả cùng một món nhiều lần;
- không cấn trừ công nợ của hoá đơn đổi (nếu lần đổi đó ghi nợ);
- không đảo đúng điểm tích luỹ đã phát sinh ở lần đổi;
- đảo giá vốn theo giá mua **hiện tại**, không phải giá vốn đã ghi sổ lần đổi.

Nói cách khác: sau lần đổi thứ nhất, chuỗi truy vết của món hàng bị đứt.

### Kịch bản người dùng báo

1. Khách mua 1 sản phẩm **trước khi dùng phần mềm** → không có hoá đơn trong hệ thống.
2. Khách mang lại đổi → thu ngân dùng **Đổi trả nhanh**, sinh hoá đơn **"đổi 1"**
   (`EXCHANGE`, có dòng IN = hàng trả, dòng OUT = hàng mua thêm).
3. Hôm nay khách mang chính món hàng của **"đổi 1"** quay lại đổi tiếp.
4. Thu ngân muốn dùng **Đổi trả hàng theo hoá đơn** → **"đổi 1" không hiện trong danh sách**.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
|---|---|---|
| Thu ngân POS | Không tìm thấy hoá đơn đổi ⇒ buộc phải "Đổi trả nhanh", nhập tay giá | Tìm thấy hoá đơn đổi trong `Đổi trả hàng`, chọn dòng "mua thêm", hệ thống tự tính tiền hoàn |
| Kế toán | Lần đổi thứ hai không nối được với chứng từ gốc, giá vốn/điểm/công nợ lệch | Chuỗi `originalInvoiceId` liên tục qua nhiều lần đổi; giá vốn và điểm đảo đúng |
| Khách hàng | Bị hoàn theo giá niêm yết hoặc bị từ chối | Được hoàn đúng số đã trả, không trả trùng quá số lượng đã mua |

## Success signal

Trên POS `Đổi trả hàng`, hoá đơn `EXCHANGE` còn dòng **OUT** chưa trả hết xuất hiện
trong lưới; mở nó ra chỉ thấy các dòng **"mua thêm"** (không thấy dòng hàng khách đã
trả); trả 1 dòng thành công và `invoice_items.returned_quantity` của đúng dòng OUT đó
tăng lên, lần thứ hai trả cùng dòng bị chặn ở đúng số lượng còn lại.

## Out of scope

- **Tách hoá đơn đổi thành 2 chứng từ** (một phiếu trả + một hoá đơn bán mới). Đó là
  thay đổi mô hình chứng từ, kéo theo đánh số, hạch toán, báo cáo — cần epic riêng.
- **Hoá đơn `type = RETURN`** (trả thuần, không mua thêm): không có dòng OUT nên không
  có gì để trả lần sau.
- **Backoffice**: màn hình đổi trả theo hoá đơn chỉ tồn tại trên POS.
- **Huỷ chuỗi**: huỷ một hoá đơn đổi đã bị trả tiếp ở lần sau — ràng buộc huỷ theo
  chuỗi là vấn đề riêng của `cancel-return.service`.
- **Khuyến mại / điểm thanh toán trên hoá đơn đổi**: luồng tạo đổi hiện đặt cứng
  `discountAmount = 0`, `depositAmount = 0`, không có `pointsDiscountAmount`.

## Constraints

| Kind | Detail |
|---|---|
| Dữ liệu | Không được đổi ý nghĩa `invoice_items.returned_quantity` — nó là accumulator dùng chung cho cả huỷ (`cancel-return.service.ts:296`) |
| Bất biến | Chứng từ đã post là immutable; không sửa hoá đơn đổi cũ, chỉ đọc |
| Kiến trúc | Tìm kiếm đi qua CQRS (`SearchReturnableInvoicesV2Handler`); FE POS dùng `http` thô + `InvoiceRow` cục bộ, KHÔNG dùng `@erp/api-client` |
| Ngôn ngữ | Source backend tiếng Anh; chuỗi UI tiếng Việt |
| Môi trường | `apps/api/.env` không có trong worktree này (nằm ở checkout gốc); dev server chạy từ checkout gốc — xem `[[reference_worktree_dev_server_parent_checkout]]` |

## Existing surface touched

Các chốt chặn `type = SALE` tìm được qua khảo sát (đều là mã sống, không phải legacy):

| Nơi | Dòng | Vai trò |
|---|---|---|
| `apps/api/src/modules/pos/queries/search-returnable-invoices-v2.handler.ts` | 114 | `inv.type = SALE` — lý do "đổi 1" không hiện |
| `apps/api/src/modules/pos/services/return-eligibility.service.ts` | 116 | `getEligibleLines` ném 400 nếu original ≠ SALE |
| `apps/api/src/modules/pos/services/return-eligibility.service.ts` | 106–147 | map **mọi** dòng, không lọc `direction` — với EXCHANGE sẽ trả cả dòng IN |
| `apps/api/src/modules/pos/services/return-eligibility.service.ts` | 151–176 | `assertLineEligible` không kiểm `direction` |
| `apps/api/src/modules/pos/services/refundable-value.util.ts` | 46–83 | `refundableFactor` cộng cả dòng IN vào mẫu số khi invoice là EXCHANGE |

Đã kiểm và **không cần đổi** (đã tổng quát theo `invoiceId` / `originalInvoiceItemId`):

- `checkout-return.service.ts` — cập nhật `returned_quantity`, `lockOriginalDebt`
  (`DebtDocumentType.CREDIT_INVOICE` khớp cả hoá đơn đổi ghi nợ), fan-out sự kiện.
- `create-exchange-invoice.service.ts` / `create-return-invoice.service.ts` — không
  kiểm `type` của hoá đơn gốc, chỉ đòi `originalInvoiceItemId`.
- `invoiceSignedTotalSql` / `getInvoiceSignedTotal` — đã xử lý EXCHANGE (dùng `netAmount`).
- Vị `EXISTS ... direction = OUT AND quantity > returned_quantity` trong handler tìm
  kiếm đã tự loại hoá đơn `RETURN` (không có dòng OUT) và hoá đơn đổi đã trả hết.

- Entry points: không thêm route mới; sửa 1 query CQRS + 1 service + 1 util.
