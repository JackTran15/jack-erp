---
id: UOW-04
slug: invoice-number-per-branch
title: Bộ đếm hoá đơn tách theo chi nhánh
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-01]
verifies: [AC-07, AC-16, AC-17]
risk: high
status: todo
rollback: "`pnpm migration:revert` — trả `uq_invoice_org_code` về `(organization_id, code)`; migration tự kiểm tra không còn hai chi nhánh nào đang giữ mã trùng trước khi DROP ràng buộc mới, nếu có thì dừng và báo thủ công xử lý trước. Các rule `document_number_rules` theo chi nhánh được nhân bản trong lúc chạy không bị xoá — vô hại vì `resolveActiveRule` không đổi thứ tự ưu tiên, chỉ cần deactivate tay nếu muốn quay hẳn về bộ đếm chung."
---

# UOW-04 — Bộ đếm hoá đơn tách theo chi nhánh

Đảo lại A-02/ADR-06 của UOW-01 theo A-10/ADR-07 (item #26 — ảnh QA cho thấy số hoá đơn nhảy
cách quãng khi lọc theo một chi nhánh, vì bộ đếm dùng chung toàn công ty).

## Demo script

1. Đảm bảo hai chi nhánh (ví dụ Cần Thơ và MT211 Đà Nẵng) cùng thuộc một công ty, cùng chưa lập
   hoá đơn bán nào hôm nay
2. Bán một đơn ở chi nhánh Cần Thơ → mã là `<YYMMDD>0001`
3. Bán một đơn ở chi nhánh MT211 Đà Nẵng → mã **cũng** là `<YYMMDD>0001` (không phải `0002`) —
   chứng tỏ hai bộ đếm độc lập, và không có lỗi vi phạm ràng buộc unique dù hai mã trùng chuỗi
4. Bán thêm một đơn nữa ở Cần Thơ → mã là `<YYMMDD>0002`
5. Mở **Danh sách hoá đơn**, lọc "Ngày tạo: Hôm nay" + chi nhánh Cần Thơ → chỉ thấy `0001` và
   `0002`, liên tục, không lẫn số của MT211 Đà Nẵng
6. Lập một phiếu trả hàng ở mỗi chi nhánh → mỗi phiếu mang hậu tố `TH` và bộ đếm trả cũng tách
   theo chi nhánh y hệt bộ đếm bán

## In scope

- Migration mở rộng `uq_invoice_org_code` → `(organization_id, branch_id, code)`
- `DocumentNumberingService`: nhân bản rule `INVOICE`/`RETURN` theo chi nhánh khi chưa có, bên
  trong `preview()`/`generate()` (preflight), không trong bước saga transactional (xem ADR-07)
- Fast-forward counter mới bằng `ensureSequenceAtLeast` để chặn va chạm khi cutover giữa ngày
- Sửa lại test của T-01-05 (AC-07) — nội dung cũ giờ khẳng định đúng hành vi đã bị đảo ngược

## Not in scope

- Đổi định dạng hiển thị `YYMMDDxxxx` (không đổi, A-10 giữ nguyên phần "không hậu tố chi nhánh")
- Màn cấu hình đánh số — vẫn không cho tạo tay rule theo chi nhánh cho INVOICE/RETURN qua UI,
  việc nhân bản là tự động và trong suốt (không thêm control mới)
- 26 loại chứng từ còn lại (A-04, không đổi)
- Backfill rule cho chi nhánh hiện có bằng migration dữ liệu — cố ý dùng nhân bản tự động ở lần
  thanh toán kế tiếp thay vì INSERT trước (xem ADR-07, "Consequences")

## Risks

| Risk | Mitigation |
|---|---|
| Cutover giữa ngày: chi nhánh tự đâm trùng mã với chính mình khi rule mới đếm lại từ 1 | `ensureSequenceAtLeast` fast-forward counter mới lên bằng giá trị hiện tại của counter dùng chung trước khi phát số đầu tiên (T-04-02) |
| `branch_id` nullable ở tầng entity — hoá đơn không có branch (nếu có) không được ràng buộc unique mới bảo vệ | Không chặn: chưa thấy hoá đơn POS nào thiếu `branchId` trên `erp_dev`; ghi nhận trong ADR-07 |
| Sửa nhầm cả tính đúng của AC-02/03/05/06/08/09 khi sửa T-01-05 | T-04-04 chỉ sửa đúng khối test của AC-07, không đụng các `it()` khác trong cùng file |
| Migration `down()` chạy khi hai chi nhánh đã có mã trùng thật | `down()` tự `SELECT` kiểm tra trước, `RAISE EXCEPTION` nếu có — cùng tinh thần ADR-06 gốc, áp cho chiều ngược lại (T-04-01) |

## Definition of done

- [x] AC-07, AC-16, AC-17 pass bằng test tự động (AC-16 ban đầu định xác nhận bằng mắt ở G4,
      nhưng T-04-03 đã thêm test tự động cho nó luôn); đối chiếu danh sách hoá đơn lọc theo chi
      nhánh không nhảy số còn lại xác nhận bằng mắt ở G4 cùng "Demoed" bên dưới
- [x] `pnpm --filter @erp/api test` xanh — 292 suite, 3189/3190 test (1 skip có từ trước, không
      liên quan), gồm cả `document-numbering.service.spec.ts` và `next-document-number.step.spec.ts`
- [x] `pnpm migration:run` / `migration:revert` chạy sạch trên `erp_dev` (T-04-01)
- [x] Hai chi nhánh bán cùng ngày ra cùng chuỗi số mà không có lỗi `23505` — chứng minh bằng e2e
      test thật (Postgres, hai checkout đồng thời) trong `checkout-saga-concurrency.e2e-spec.ts`
- [x] Demoed và accepted ở gate G4 — click-through thật trên `erp2` (không phải `jack-erp`),
      `erp_dev` thật, POS `:3001`: bán ở Hà Nội → `2608240001`; bán ở Hồ Chí Minh → `2608240003`;
      bán lại ở Hà Nội → cũng `2608240003` — hai chi nhánh cùng ra một số, không đâm `23505`.
      `document_number_rules`/`document_number_counters` xác nhận mỗi chi nhánh có rule + counter
      riêng. Danh sách hoá đơn lọc theo từng chi nhánh xác nhận không lẫn số chi nhánh khác.
      Accepted bởi Akenzy, 2026-08-24
