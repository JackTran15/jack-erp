---
id: UOW-01
slug: partner-order-intake
title: Website công ty đặt được đơn qua API key, đơn rơi vào pool chưa phân
demoable: true
duration: 2d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08]
risk: high
status: todo
rollback: revert 2 migration (drop sales_channels, drop cột mới trên sales_orders, trả salesperson_id về NOT NULL sau khi xoá đơn web) + revert controller/service; đơn web là dữ liệu mới, không đụng đơn mobile đang chạy
---

# UOW-01 — Website đặt đơn qua API key

## Demo script
1. Backoffice → `/admin/sales-channels` → tạo kênh `WEB` / "Website công ty", active
2. Backoffice → API key → cấp một key mang quyền `partner.order.create`, gắn kênh `WEB`
3. `curl POST /v2/partner/orders` với key đó: 1 dòng `SKU-500` × 2, người nhận + tỉnh/phường thật, `externalOrderId: "WEB-1001"` → **201**, trả `documentNumber`
4. Adminer → `sales_orders`: 1 dòng, `branch_id IS NULL`, `status = 'SENT'`, `salesperson_id IS NULL`, đơn giá 500.000 (giá niêm yết lúc đặt, không phải giá đối tác gửi)
5. Gửi lại **đúng** payload bước 3 → **200**, trả đúng đơn cũ; `sales_orders` vẫn 1 dòng
6. Gửi đơn với `wardCode` bịa → **400** `GEO_CODE_UNKNOWN`, không dòng nào được ghi
7. Đổi `selling_price` của `SKU-500` thành 600.000 → đơn ở bước 3 vẫn 500.000
8. POS chi nhánh Hồ Chí Minh + chi nhánh kiểm thử: lưới đơn hàng **không** thấy đơn nào vừa tạo

## In scope
- `sales_channels` (ADR-03) + đăng ký qua generic CRUD platform
- Nới `sales_orders`: `salesperson_id` nullable, `sales_channel_id`, `external_order_id`, `shipping_fee`, người nhận, địa chỉ giao snapshot (ADR-01, ADR-05)
- `PartnerOrderV2Controller` + `createFromPartner` — khớp/tạo khách theo SĐT, chốt giá server-side, replay theo `externalOrderId`

## Not in scope
- Điều phối (UOW-02) — đơn nằm im trong pool, chưa ai phân
- Phí giao lên hoá đơn (UOW-04); đợt này phí chỉ nằm trên đơn
- Khuyến mãi: đơn web không gọi engine (ngoài phạm vi feature)

## Risks
| Risk | Mitigation |
| --- | --- |
| Nới `salesperson_id` về nullable làm vỡ chỗ đọc đơn mobile vốn giả định luôn có | `grep salespersonId` trong `modules/mobile` + `sales-order` trước khi sửa; đơn mobile vẫn luôn set giá trị nên đường cũ không đổi hành vi |
| Đối tác retry song song hai request cùng `externalOrderId` → hai đơn | UNIQUE (org, channel, external_order_id) ở tầng DB, không chỉ check-then-insert; bắt lỗi unique và trả về đơn đã có |
| Tạo khách trùng vì SĐT khác định dạng (`0901…` vs `+84901…`) | Chuẩn hoá SĐT về một dạng trước khi khớp; ghi rõ quy tắc trong T-01-04 |
| API key rò sang kênh khác → đơn gắn sai nguồn | Kênh lấy từ cấu hình của key, KHÔNG từ payload đối tác |

## Definition of done
- [x] AC-01..AC-08 có bằng chứng trong `07-verification.md`
- [x] Đơn mobile hiện có: tạo / duyệt / huỷ vẫn chạy y như trước (e2e cũ xanh)
- [x] `pnpm --filter @erp/api test` xanh
- [ ] `pnpm openapi:generate` đã chạy, `schema.ts` + snapshot đã commit
