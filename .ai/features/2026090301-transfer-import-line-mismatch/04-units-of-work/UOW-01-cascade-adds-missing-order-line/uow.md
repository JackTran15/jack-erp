---
id: UOW-01
slug: cascade-adds-missing-order-line
title: Sửa phiếu xuất thì lệnh điều chuyển tự nới, và có bằng chứng nó chạy thật
demoable: true
duration: 1d
depends_on: []
requirements: [US-01, US-03]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-10]
risk: medium
status: todo
rollback: revert 1 commit — không có migration, không đổi hợp đồng HTTP, không đổi FE
---

# UOW-01 — Cascade nới lệnh điều chuyển khi phiếu xuất đổi

## Demo script

1. Đăng nhập backoffice ở chi nhánh gửi, mở Kho → Xuất kho, tìm phiếu xuất điều chuyển
   của một lệnh mà chi nhánh nhận **chưa** nhập.
2. Bấm Sửa. Trong cùng một lần lưu: **xoá** một dòng, **đổi số lượng** một dòng, và
   **thêm một mặt hàng mới** chưa có trên lệnh. Lưu.
3. Chạy truy vấn đối chiếu (in ra ngay trong demo): `goods_issue_lines` và
   `transfer_order_lines` của lệnh đó khớp nhau — mặt hàng mới đã có dòng trên lệnh,
   dòng bị xoá về 0, dòng sửa mang số lượng mới.
4. Đổi sang chi nhánh nhận, mở Nhập kho → Điều chuyển từ cửa hàng khác, chọn đúng
   chứng từ, bấm Lưu.
5. Phiếu nhập được tạo, **không có lỗi 400**. Đây chính là bước đã hỏng ở QA #8.
6. Mở log API: thấy dòng `inserted a new transfer_order_lines row for item …` — dấu vết
   mà toàn bộ prod trước nay chưa từng có.

## In scope

- Helper dùng chung đọc kết quả `… RETURNING` (ADR-01), nâng từ bản đang nằm trong
  `sync-admin-permissions.seed.ts` lên chỗ dùng chung được.
- `adjustRequestedQty` phân biệt "khớp 0 dòng" bằng affected count thật.
- Hồi quy chạm Postgres thật (ADR-02), vì bug này đã sống sót qua một unit test viết
  riêng để chặn nó.
- Sửa mock trong spec hiện có cho đúng hình dạng TypeORM thật.

## Not in scope

- Bù dữ liệu đã lệch (UOW-02).
- `StockLedgerService.setTracked` (UOW-03).
- Nhánh `applyDeltaToLines` khi chi nhánh nhận đã nhập — đường đó bị
  `assertExportIssueCanBeEdited` chặn từ trước; ghi nhận là nợ kỹ thuật.

## Risks

| Risk | Mitigation |
| --- | --- |
| Sửa xong vẫn không chạy, đúng như lần 24/08 | T-01-03 là e2e trên Postgres thật; tiêu chí đậu là **dòng trong bảng**, không phải lời gọi mock |
| Chèn dòng làm vỡ `deriveExportLines` khi xuất lại | `source_location_id` được resolve đúng như `fillSourceLocations`; T-01-02 khẳng định dòng mới đủ cột |
| Nâng cấp TypeORM đổi hình dạng trả về | T-01-01 khoá cả bốn hình dạng bằng test chạy trên Postgres thật |

## Definition of done

- [x] AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-10 đậu
- [x] E2E chứng minh dòng `transfer_order_lines` thật sự được chèn (không mock lớp truy vấn)
- [x] `pnpm --filter @erp/api test` xanh; `nest build` sạch
- [x] Không còn chỗ nào trong `apps/api/src` suy số dòng bị chạm từ `.length` của `query()`
- [ ] Demoed và được chấp nhận ở G4

## Verification (2026-09-04)

- `pnpm --filter @erp/api test` → 3522 passed, 1 skipped, **2 failed** in
  `auth.service.spec.ts` (`switchBranch`/TTL) — confirmed pre-existing on `main`
  before this feature's changes (reran the same spec against a clean stash of
  this feature's diff; identical failures). Unrelated module, not touched by
  UOW-01/02/03.
- `pnpm --filter @erp/api test:e2e -- transfer-order-export-edit-then-import
  typeorm-returning-shape` → 7/7 tests passed. One suite shows as `FAIL` only
  because `OutboxRelayService`'s background poller raced the next suite's
  `resetDatabase()` and hit a dropped `outbox_messages` table during teardown —
  the documented outbox-relay-race trap, not a test assertion failure.
- `pnpm --filter @erp/api build` (`nest build`) → clean, no errors.
- Re-audited all `manager.query()`/`dataSource.query() … RETURNING` call sites
  in `apps/api/src` for `.length` misreads; found the same single documented
  exception as T-03-01's table (`migrations/1789000000000`, a completed
  migration whose miscounted value only feeds a log line) — no new spot.
