---
id: UOW-07
slug: end-to-end-evidence
title: Bằng chứng đầu-cuối rằng engine, repository và tầng HTTP thật sự khớp nhau
demoable: true
duration: 2d
depends_on: [UOW-03, UOW-04, UOW-05, UOW-06]
requirements: [US-07]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23, AC-24, AC-25, AC-26, AC-27, AC-28, AC-29, AC-30]
risk: medium
status: todo
rollback: chỉ thêm file test và sửa build script — revert không ảnh hưởng runtime
---

# UOW-07 — Cổng chặn cuối

Nguyên tắc: e2e phủ **tích hợp và dữ liệu thật**; logic tính tiền đã được phủ ở unit của
UOW-02, không lặp lại toàn bộ ma trận — chỉ chạy các AC làm bằng chứng đầu-cuối.

Mở đầu bằng một việc nhỏ nhưng chặn tất cả: hiện tại `packages/shared-interfaces/dist/promotion`
chưa được build, nên **21 trong 27 test suite của module promotion không compile**. Chưa chạy
được test thì mọi khẳng định "xanh" ở các UoW trước đều là chưa kiểm chứng.

## Demo script

1. `pnpm build:shared` rồi `pnpm --filter @erp/api test -- promotion` → **đọc output thật**,
   xác nhận 27/27 suite compile và pass (T-07-01).
2. `docker compose up -d`, `pnpm --filter @erp/api test:e2e` → 3 spec promotion/voucher xanh.
   Kafkajs để hở handle nên teardown treo có thể giả dạng "suite failed" — đọc output, không
   tin dòng exit.
3. Mở output e2e, đối chiếu tên test mang mã AC với bảng AC trong `02-requirements.md`.
4. Chạy checklist QA thủ công trên `make dev-api` + `make dev-backoffice` cho phần FE, chụp
   màn hình `TIERED_DISCOUNT` và `BUY_M_GET_N`.

## In scope

- Sửa môi trường test (build shared) và chạy lại toàn bộ unit của module.
- 3 spec e2e: vòng đời CTKM, evaluate, voucher.
- Bổ sung mục "Kịch bản kiểm thử" vào `docs/26-promotion-design.md` §11 (hiện là chỗ trống).

## Not in scope

- Gắn test runner thật cho `apps/backoffice-web` (A-24) — ticket hạ tầng riêng.

## Risks

| Risk | Mitigation |
|---|---|
| Teardown treo vì kafkajs giả dạng "suite failed" | Đọc output thật, không tin dòng exit; `forceExit: true` đã bật (T-07-01) |
| Suite fail vì thiếu env DB tường minh | Nạp `apps/api/.env`, `global-setup.ts` tự tạo `erp_test` và chạy migration trước suite |
| 403 branch scope tưởng như lỗi permission | Login trong test cần `organizationId`; `actor.branchId` lấy **JWT trước, header sau** |
| Seed copy-paste giữa hai spec rồi lệch nhau | Một helper seed dùng chung cho cả spec crud và evaluate |

## Definition of done

- [ ] Toàn bộ AC-01…AC-30 có bằng chứng: e2e cho phần backend, checklist QA cho phần FE
- [ ] `pnpm --filter @erp/api test` xanh (toàn bộ unit, 27/27 suite compile)
- [ ] `pnpm --filter @erp/api test:e2e` xanh — đã đọc output thật
- [ ] `pnpm build` toàn workspace xanh
- [ ] `docs/26-promotion-design.md` §11 không còn là chỗ trống
- [ ] Ảnh chụp màn hình cho ≥ 2 hình thức phức tạp nhất đính kèm PR
