---
id: UOW-03
slug: all-four-report-domains
title: Ba miền còn lại (Bán hàng, Công nợ, Lợi nhuận) dùng chung ngữ nghĩa phạm vi
demoable: true
duration: 2d
depends_on: [UOW-01, UOW-02]
requirements: [US-01, US-02]
verifies: [AC-10]
risk: medium
status: todo
rollback: revert 3 commit theo miền — mỗi miền độc lập, `report-core` không đổi
---

# UOW-03 — Áp phạm vi chi nhánh cho cả bốn miền

Bốn bộ route `/reports/{invoices,inventory,debts,profit}/templates` **dùng chung bảng
`report_templates`**. Sau UOW-01+02 chỉ miền kho hiểu phạm vi; ba miền còn lại vẫn đọc–ghi
theo tổ chức trên đúng bảng đó. Để nguyên là rò cấu hình chéo chi nhánh qua cửa sau: người
dùng đổi bố cục ở Báo cáo Bán hàng vẫn đè lên cả chuỗi.

Trên UI chỉ demo được miền `invoice` (`TEMPLATE_SOURCES = ["inventory", "invoice"]`); hai
miền `debt` / `profit` demo ở mức API — FE chưa bật lưu cấu hình cột cho chúng và ticket này
**không** bật (lý do ở `00-intent.md` § Ngoài phạm vi).

## Demo script

1. UI: đứng ở chi nhánh HCM, mở `/reports/sales` (Báo cáo Bán hàng), đổi bố cục, Lưu; đổi
   sang chi nhánh khác → thấy bố cục khác. Lặp lại bước demo của UOW-01 trên miền này.
2. API (Công nợ): với token của chi nhánh A,
   `POST /reports/debts/templates {reportType, name:"Mặc định", columns, scope:"branch"}` → 201.
   Cùng payload với token chi nhánh B → 201 (không 409).
   `GET /reports/debts/templates?reportType=…&scope=branch` ở mỗi chi nhánh → trả đúng bản của mình.
3. API (Lợi nhuận): lặp bước 2 trên `/reports/profit/templates`.
4. `select report_type, branch_id, count(*) from report_templates group by 1,2;` → không
   `reportType` nào còn dính một hàng duy nhất dùng chung cho nhiều chi nhánh sau khi đã lưu riêng.

## In scope

- Miền `reporting/invoice-report`, `reporting/debt-report`, `reporting/profit-report`: cả 5
  handler mỗi miền + DTO create/update nhận `scope` + controller nhận `@Query('scope')`.
- `pnpm openapi:generate` một lần cho cả 4 miền, commit `schema.ts` + `openapi.snapshot.json`.
- Spec đối chiếu bốn miền cùng hành vi.

## Not in scope

- Bật `TEMPLATE_SOURCES` cho `debt` / `profit` trên FE — chặn bởi `buildColumnCatalog` chưa
  nhận `statBy`/`groupBy`, là việc riêng.
- Bật lại `@RequirePermission(TEMPLATE_MANAGE)` đang bị chú thích tắt ở cả 4 controller (A-10).

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Ba miền có `report-template-column.dto.ts` **riêng** mỗi miền dù nội dung gần y hệt — sửa nhầm file | T-03-01..03 tách theo miền, mỗi ticket một thư mục, không ticket nào đụng thư mục của ticket khác |
| Sót một handler ⇒ miền đó vẫn ghi theo chuỗi, lỗi chỉ lộ khi có nhiều chi nhánh | T-03-05 chạy cùng bộ ca cho cả 4 miền; `grep -c "organizationId: actor.organizationId"` phải về đúng số kỳ vọng |
| `openapi:generate` cần API chạy trên :4000, và có thể là API dựng từ worktree khác | T-03-04 buộc kiểm `curl :4000/docs-json` trước khi sinh lại |

## Definition of done

- [x] AC-10 pass trên cả bốn miền
- [x] Không handler template nào trong repo còn lọc chỉ bằng `organizationId` — ca canh gác quét cả 20 file
- [x] `pnpm --filter @erp/api test` xanh — 3505 pass
- [x] `packages/api-client/src/generated/schema.ts` + `openapi.snapshot.json` đã sinh lại (**chưa commit** — cả feature còn nguyên trong working tree)
- [x] Demo script chạy được — bước 2 và 3 (API cho Công nợ / Lợi nhuận) đo thật; bước 1 (UI Báo cáo Bán hàng) đi cùng đường mã đã đo ở miền Kho
