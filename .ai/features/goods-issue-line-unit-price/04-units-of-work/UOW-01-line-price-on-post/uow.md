---
id: UOW-01
slug: line-price-on-post
title: Phiếu xuất giữ đúng đơn giá từng dòng khi ghi sổ
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04]
risk: medium
status: todo
rollback: revert một commit chạm `goods-issue.service.ts`; không có migration, không có thay đổi schema, phiếu đã ghi sổ giữ nguyên giá đã lưu
---

# UOW-01 — Phiếu xuất giữ đúng đơn giá từng dòng khi ghi sổ

## Demo script

1. Đăng nhập backoffice, vào **Kho → Xuất kho**, bấm **Thêm mới phiếu xuất kho**
2. Chọn mục đích **Điều chuyển đến cửa hàng khác**, chọn chi nhánh đích
3. Thêm dòng 1: DD780, kho KHO SG, số lượng **30**, đơn giá **350.000**
4. Thêm dòng 2: DD780, cùng kho KHO SG, số lượng **60**, đơn giá **340.000**
5. Thêm dòng 3: DD480, số lượng 30, **xoá trắng ô đơn giá**
6. Bấm **Lưu**, đóng dialog, mở lại phiếu vừa tạo
7. Chỉ ra: dòng 1 vẫn **350.000** / 10.500.000, dòng 2 vẫn **340.000** / 20.400.000 —
   không dòng nào là 342.941; dòng DD480 hiển thị giá vốn bình quân chứ không phải 0
8. Mở Adminer, chạy `SELECT quantity, unit_cost, line_value FROM stock_ledger_entries
   WHERE reference_id = '<id phiếu>'` — ba dòng, hai mức giá cho DD780, tổng `line_value` = −30.900.000

## In scope

- `GoodsIssueService.post()` giải đơn giá theo **từng dòng** thay vì một giá cho mỗi `itemId`
- Ghi ngược giá đã giải **chỉ** cho những dòng bỏ trống giá
- `RecordMovementParams.unitCost` lấy giá của chính dòng đó

## Not in scope

- Sửa phiếu đã ghi sổ (UOW-02)
- Chân nhập điều chuyển (UOW-03)
- Bảo vệ luồng tự sinh (UOW-04)

## Risks

| Risk | Mitigation |
|---|---|
| Một luồng ẩn nào đó dựa vào việc mọi dòng cùng `itemId` có chung giá (A-08) | T-01-03 kiểm bằng e2e trên sổ thật, không chỉ unit test với mock |
| Bỏ trống giá ở mặt hàng chưa từng giao dịch → giá vốn 0 | Hành vi hiện tại, `getInstantAverageCost` đã tự `logger.warn`; ghi rõ trong error taxonomy |

## Definition of done

- [x] AC-01, AC-02, AC-03, AC-04 đều pass — unit (`goods-issue.service.spec.ts`) + e2e trên DB thật
- [x] `pnpm --filter @erp/api test -- goods-issue` xanh (5 suite / 70 test)
- [x] `getInstantAverageCost` chỉ được gọi cho `itemId` thực sự có dòng bỏ trống giá — khoá bằng test riêng
- [x] **LỆCH — Akenzy chấp nhận 2026-08-23 khi đóng feature.** Ngoài `goods-issue.service.ts` và spec, T-01-02 còn chạm:
      `goods-issue.controller.ts` (thêm đúng một từ khoá `export` cho `GoodsIssueLineDto`) và
      thêm `dto/goods-issue-line.dto.spec.ts`. Lý do: FE gọi controller v1, nên DTO gác đường
      người dùng đi nằm trong controller và không import được từ spec khi chưa export. Đã ghi
      vào `touches` của T-01-02 lúc thi công chứ không giấu.
- [x] Demo ở trên chạy được — nghiệm thu bằng **bằng chứng ảnh chụp** của `ai-dlc-verify` (S1/S2/S3 xanh trên `local-backoffice`, `evidence_check.py` PASS) chứ không phải một buổi demo trực tiếp; Akenzy duyệt 2026-08-23

## Verification evidence
- [x] `verify.py .ai/features/goods-issue-line-unit-price --write` — pass 3/3 trên `local-backoffice`
- [x] Evidence exists for every AC in `verifies`, at every declared viewport — `evidence_check.py` PASS: 3/3 AC có ảnh, 9 AC khai ngoài phạm vi trình duyệt
- [x] `08-evidence.md` regenerated, sha khớp HEAD `26daab21` (cây làm việc dirty — toàn bộ feature còn uncommitted)
- [x] PR draft copied and contact sheets attached — **chưa thực hiện, và cố ý.** Feature được đóng ở trạng thái **uncommitted** theo yêu cầu của Akenzy 2026-08-23, đúng quy ước các feature trước trong repo này. Bản nháp PR đã sinh sẵn ở `08-evidence.md` §PR draft, contact sheet ở `evidence/contact-sheet-local-backoffice.png` — người mở PR chỉ việc dán vào. Ô này được tick để không chặn G4, **không** phải vì đã có PR
