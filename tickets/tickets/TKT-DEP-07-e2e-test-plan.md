# TKT-DEP-07 E2E + test plan

## Epic

[EPIC-19072026 Deposit Screens — Branch Scope & MISA Parity](../epics/EPIC-19072026-deposit-screens-branch-scope.md)

## Summary

Khoá lại hành vi "xem toàn bộ quỹ của chi nhánh" bằng e2e chạy thật qua HTTP → Postgres, tập trung vào chỗ dễ sai nhất: số dư luỹ kế gộp nhiều quỹ và việc tách hai chân của chuyển quỹ nội bộ.

## Deliverables

- `apps/api/test/e2e/deposit-ledger-branch-scope.e2e-spec.ts` (mới)
- Cập nhật checklist QA thủ công cho phần FE trong mô tả PR

## Acceptance Criteria

- [ ] E2E dựng dữ liệu: 1 org, 2 chi nhánh; chi nhánh A có **2** quỹ (opening khác nhau), chi nhánh B có **1** quỹ.
- [ ] `GET /deposit-ledger` **không** `depositAccountId` (chi nhánh A) → chỉ trả giao dịch của 2 quỹ thuộc A, tuyệt đối không có dòng nào của B.
- [ ] `openingBalance` == tổng `opening_balance` của 2 quỹ A (+ phát sinh trước `dateFrom`).
- [ ] Tạo **chuyển quỹ nội bộ** giữa 2 quỹ của A → response có **đúng 2 dòng** cho chứng từ đó, `signed` ngược dấu nhau, `Số dư cuối kỳ` **không đổi**.
- [ ] Tạo **chuyển liên chi nhánh** A→B → ở phạm vi A có **đúng 1 dòng** (chân chi), dấu âm.
- [ ] `GET /deposit-ledger?depositAccountId=<quỹ 1 của A>` → khớp **chính xác** kết quả trước epic (test hồi quy BR-LEDG-03).
- [ ] `depositAccountId` của quỹ thuộc **B** khi đang ở branch A → `404`.
- [ ] Phân trang `pageSize=2` qua nhiều trang → dãy `running` liên tục, không trùng/thiếu dòng.
- [ ] Chi nhánh không có quỹ nào → `200` với `rows: []`, `openingBalance: 0` (không `500`, không `404`).
- [ ] `Số dư cuối kỳ` (khoảng ngày phủ toàn bộ) == `SUM(deposit_accounts.balance)` của các quỹ ACTIVE thuộc chi nhánh.

## Definition of Done

- [ ] `pnpm --filter @erp/api test:e2e` pass với suite mới.
- [ ] `pnpm --filter @erp/api test` vẫn pass (không hồi quy unit).
- [ ] Checklist QA thủ công FE đã chạy đủ và ghi kết quả vào PR.

## Tech Approach

E2E chạy trên DB riêng `erp_test`; `test/e2e/setup/global-setup.ts` tự tạo DB và chạy migration. Suite chạy tuần tự (`maxWorkers: 1`) với `forceExit: true` — **consumer kafkajs để hở handle nên teardown treo có thể giả dạng "suite failed"; đọc output test thật, đừng tin mỗi exit message.**

Cách dựng dữ liệu: gọi API thật (`POST /bank-receipts` + `/post`, `POST /deposit-transfers`) thay vì insert thẳng, để chuỗi movement/journal sinh ra đúng như production. Riêng `opening_balance` set khi tạo `deposit_accounts`.

Ràng buộc ngày: dùng mốc cố định truyền vào, **không** `Date.now()` trong assertion, tránh test lệch khi chạy qua nửa đêm.

### Checklist QA thủ công (FE)

| # | Bước | Kỳ vọng |
| - | ---- | ------- |
| 1 | Mở cả 3 màn ở chi nhánh Hồ Chí Minh | Có dữ liệu ngay, không phải chọn quỹ |
| 2 | Thanh tab cạnh tiêu đề | 3 mục, mục hiện tại in đậm không phải link |
| 3 | Bấm qua lại 3 tab | Không full reload |
| 4 | Dropdown quỹ | `Tất cả` đứng đầu, là mặc định |
| 5 | Chọn `Lam Hoang An` rồi `SHB` | Lọc đúng từng quỹ |
| 6 | Về `Tất cả` | Thấy lại toàn bộ |
| 7 | Cột `Số tài khoản` ở màn Thu-chi | Có giá trị mọi dòng |
| 8 | Sổ chi tiết, tạo chuyển quỹ nội bộ | 2 dòng, số dư cuối kỳ không đổi |
| 9 | Xuất khẩu sổ chi tiết cả 2 chế độ | File khớp bộ lọc đang áp |
| 10 | Đổi sang chi nhánh Hà Nội (0 quỹ) | Empty state, không lỗi, không spinner treo |
| 11 | Đổi ngược về Hồ Chí Minh | Không dính lựa chọn quỹ của chi nhánh cũ |
| 12 | Sidebar nhóm TIỀN GỬI | Đúng 3 mục, đúng thứ tự |
| 13 | Tìm 6 mục đã chuyển nhóm | Đều còn truy cập được, không 404 |

## Testing Strategy

- E2E: file spec ở trên.
- Unit: đã phủ trong [TKT-DEP-01](./TKT-DEP-01-deposit-ledger-branch-scope.md); ticket này không lặp lại.
- FE: thủ công theo bảng trên (backoffice-web chưa có test runner).

## Dependencies

- Depends on: [TKT-DEP-04](./TKT-DEP-04-fe-receipts-recon-all-accounts.md), [TKT-DEP-05](./TKT-DEP-05-fe-ledger-all-accounts.md), [TKT-DEP-06](./TKT-DEP-06-navconfig-regroup.md)
- Blocks: —
