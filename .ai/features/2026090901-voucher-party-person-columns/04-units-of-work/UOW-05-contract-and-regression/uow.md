---
id: UOW-05
slug: contract-and-regression
title: Hợp đồng API sinh lại và bộ e2e chống hồi quy fallback
demoable: true
duration: 0.5d
depends_on: [UOW-01, UOW-02, UOW-03, UOW-04]
requirements: [US-06]
verifies: [AC-15, AC-04, AC-08, AC-11]
risk: low
status: todo
rollback: revert 2 ticket; snapshot OpenAPI quay lại bản trước
---

# UOW-05 — Hợp đồng API sinh lại và bộ e2e chống hồi quy

## Demo script

1. `git diff packages/api-client/src/generated/schema.ts` → `personName` có mặt ở **cả bốn**
   schema tìm kiếm, và mô tả của `counterparty` không còn chữ "falling back".
2. Chạy `pnpm --filter @erp/api test:e2e -- --testPathPattern voucher-party-person` →
   suite xanh, in ra 4 khẳng định "lọc cột Đối tượng bằng tên người ⇒ 0 dòng".
3. Tắt một dòng sửa bất kỳ trong SQL rồi chạy lại → suite đỏ. Đây là thứ chứng minh bộ test
   thật sự canh cái fallback, chứ không chỉ chạy qua.

## In scope

- Sinh lại `packages/api-client` + `openapi.snapshot.json` từ build riêng ở `:4100`.
- Một suite e2e mới khẳng định "không fallback" trên cả 4 endpoint đọc.

## Not in scope

- Bất kỳ thay đổi hành vi nào — UoW này chỉ chốt hợp đồng và dựng lưới an toàn.

## Risks

| Risk | Mitigation |
|---|---|
| `generate-openapi.mjs` im lặng rơi về stub khi fetch hỏng | Đọc dòng log `Wrote … from <url>`; không tin exit code |
| Dev server `:4000` phục vụ build cũ | Bắt buộc dựng `dist-openapi` + chạy `PORT=4100` (công thức trong T-05-01) |
| e2e treo do consumer Kafka | Suite chạy `--forceExit` như phần còn lại của repo; đọc kết quả test, không đọc thông báo teardown |

## Definition of done

- [x] AC-15 pass; `schema.ts` và `openapi.snapshot.json` đã cập nhật
- [x] Suite e2e mới xanh và đỏ đúng cách khi hoàn tác một sửa đổi SQL
- [ ] Demoed và được chấp nhận ở G4

`schema.ts`: `personName` 6 lần, 0 lần "falling back". e2e 12/12 xanh; kiểm đột biến khôi
phục `COALESCE` cũ ở `cash-ledger.service.ts` làm **đúng một** spec đỏ, khôi phục lại 18/18 xanh.
