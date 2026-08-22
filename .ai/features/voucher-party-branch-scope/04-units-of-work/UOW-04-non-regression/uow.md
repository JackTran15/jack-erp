---
id: UOW-04
slug: non-regression
title: Quyền tổng vẫn thấy đủ, phiếu cũ vẫn đọc được tên, không chi nhánh thì rỗng
demoable: true
duration: 1d
depends_on: [UOW-01, UOW-02, UOW-03]
requirements: [US-04]
verifies: [AC-10, AC-11, AC-12]
risk: medium
status: todo
rollback: chỉ thêm test; revert không ảnh hưởng hành vi
---

# UOW-04 — Không phá thứ đang chạy

Ba nhánh `all` / `branch` / `none` trong ADR-05 chỉ có giá trị nếu cả ba đều được chạy thật
trên DB. Lát cắt này là bằng chứng đó, chạm cả bốn endpoint trong một suite.

## Demo script

1. Chạy `pnpm --filter @erp/api test:e2e -- employee-branch-scope` — suite xanh
2. Đọc output: mỗi endpoint trong bốn endpoint xuất hiện đúng ba lần (một lần mỗi mode)
3. Đăng nhập backoffice bằng `admin@erp.local` (**có** `iam.user.read.all`) ở chi nhánh
   **Hà Nội**, mở ô Đối tượng > Nhân viên: vẫn thấy đủ 4 nhân viên gồm `Nhân viên HCM`
4. Mở lại một phiếu nhập kho cũ có đối tượng là `Nhân viên HCM`, bằng tài khoản **không** có
   quyền tổng, ở chi nhánh **Hà Nội**: ô Đối tượng vẫn hiển thị đúng mã và tên

## In scope

- Một e2e spec chạm cả 4 endpoint × 3 mode
- Kiểm đường đọc id → tên không bị lọc (ADR-04)

## Not in scope

- Đo hiệu năng — NFR về round-trip đã khoá ở T-01-01 bằng thiết kế (không nạp trước id)

## Risks

| Risk | Mitigation |
|---|---|
| Suite e2e thoát code 1 dù mọi test xanh (OutboxRelay đua với `resetDatabase()`) | Đọc output test thật, không tin exit code — xem `reference_e2e_outbox_relay_race` |
| Dựng actor "không chi nhánh nào" khó vì `branchIds` luôn có phần tử trên token thật | Dựng token cho user chưa gán chi nhánh nào; nếu không dựng được ở e2e thì AC-12 lùi về unit test của T-01-01 và ghi rõ trong *Not verified here* |

## Definition of done

- [ ] AC-10, AC-11, AC-12 pass
- [ ] `pnpm --filter @erp/api test:e2e` xanh (đọc output, không đọc exit code)
- [ ] Demoed và accepted ở gate G4
