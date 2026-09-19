---
id: UOW-03
slug: posted-invoice
title: Hóa đơn đã lưu — API trả snapshot đủ, chi tiết và in lại vẽ từng dòng
demoable: true
duration: 1.5d
depends_on: [UOW-02]
requirements: [US-04, US-05]
verifies: [AC-14, AC-15, AC-16, AC-17]
risk: medium
status: todo
rollback: revert DTO/service + regen api-client; không migration, không dữ liệu
---

# UOW-03 — Hóa đơn đã lưu

## Demo script
1. `GET /invoices/<id 2609180003>` → `appliedPromotions[0..1]` có `code`, `name`, `lineDiscounts[{lineId, discountAmount, unitPriceAfter}]`; `lineId` trùng `items[].id`
2. POS → **Hóa đơn** → mở `2609180003` → dialog: dòng SKU-685 nhãn *CTKM-A … (68.500)*, Thành tiền 616.500; SKU-100 nhãn *CTKM-B … (10.000)*, 100.000
3. Bấm **In** trong dialog → HTML in từng dòng giống hóa đơn lúc bán (UOW-02 bước 1), không có request nào tới `/v2/promotions/evaluate`
4. Mở một hóa đơn cũ không có snapshot → dialog và in lại như hôm nay, `appliedPromotions: []`
5. `pnpm --filter @erp/api test` và `test:e2e -- promotion|invoice` xanh; `git diff packages/api-client` chỉ thêm field

## In scope
- `AppliedInvoicePromotionDto` + `invoice.service.ts` map thêm cột; e2e AC-14
- `pnpm openapi:generate`; `InvoiceRow.appliedPromotions` phía pos-web
- `InvoiceReceiptDialog` dòng + `invoiceRowPrintPayload` nhãn/lineTotal
- Hồi quy toàn bộ (AC-17)

## Not in scope
- backoffice-web, `modules/mobile` (A-11 — chỉ grep xác nhận không vỡ)
- Draft (`InvoiceDetailPanel`) — A-07

## Risks
| Risk | Mitigation |
| --- | --- |
| Client khác validate strict `appliedPromotions` | `grep -rn appliedPromotions apps packages --include=*.ts*` ngoài pos-web trước khi đổi (A-11) |
| `line_discounts` jsonb null ở hóa đơn cũ | Map `?? []`; e2e có case không snapshot |
| `pnpm openapi:generate` cần API chạy trên :4000 với code mới — `nest build` giết dev watcher (memory `nest-build-kills-dev-watcher`) | Chạy API code mới bằng `pnpm --filter @erp/api start:dev` ở cổng khác hoặc restart có chủ ý, ghi lại trong 07-verification |

## Definition of done
- [x] AC-14 xanh bằng e2e Jest (đọc DB thật, 2/2); AC-15/16 bằng ảnh headless + HTML in (`--posted`, `--posted-plain`); AC-17 bằng log test (`07-verification.md`)
- [x] `packages/api-client/src/generated/schema.ts` và `openapi.snapshot.json` regen, diff chỉ thêm (đối chiếu bằng script ở T-03-02)
- [x] Không file ngoài `touches:` — hai spec có sẵn khẳng định shape cũ (`invoice.service.spec.ts`, `checkout-saga-promotion.e2e-spec.ts`) được khai thêm vào T-03-01/T-03-04 trước khi sửa
