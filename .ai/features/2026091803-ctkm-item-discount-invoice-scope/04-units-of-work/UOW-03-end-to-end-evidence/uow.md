---
id: UOW-03
slug: end-to-end-evidence
title: Bằng chứng đầu-cuối trên trình duyệt và hồi quy toàn bộ
demoable: true
duration: 1d
depends_on: [UOW-01, UOW-02]
requirements: [US-03]
verifies: [AC-21]
risk: medium
status: todo
rollback: không có gì để rollback — UoW này chỉ đọc và chụp, không đổi mã sản phẩm
---

# UOW-03 — Bằng chứng đầu-cuối và hồi quy

Bạn yêu cầu "viết tất cả test case trước khi test" và "test kĩ trên database".
Hai UoW trước sinh ra test; UoW này **chạy tất cả** và để lại bằng chứng xem được.

## Demo script
1. Chạy `pnpm --filter @erp/api test -- promotion` → toàn bộ unit test promotion xanh
2. Chạy `pnpm --filter @erp/api test:e2e -- promotion` → e2e CRUD + phạm vi + checkout xanh
3. Mở `07-verification.md` — với mỗi bước có ảnh chụp desktop ở `local-backoffice` và `local-pos`
4. Đối chiếu ảnh bước "POS đối chiếu số học" với con số trong AC-10: **706.500**
5. Chạy truy vấn tổng kết và dán kết quả vào báo cáo:
   `SELECT type, invoice_scope, count(*) FROM promotion_programs WHERE deleted_at IS NULL GROUP BY 1,2;`

## In scope
- Chạy lại toàn bộ suite promotion + checkout-saga, xác nhận không đỏ thêm (AC-21)
- Viết `07-verification.md` theo hợp đồng của `ai-dlc-verify`, dùng `local-backoffice` và `local-pos` đã cấu hình sẵn trong `.ai/aidlc.yaml`
- Ảnh chụp luồng tạo CTKM hàng hóa và luồng đối chiếu số tiền ở POS

## Not in scope
- Wire test runner cho `backoffice-web`/`pos-web` (A-17) — là feature riêng, không gộp vào đây
- Chạy trên staging/prod — chỉ `local` (hai môi trường còn lại không nằm trong yêu cầu)

## Risks
| Risk | Mitigation |
| --- | --- |
| e2e dùng `forceExit: true`; teardown treo có thể trông như suite đỏ | Đọc output thật, không đọc mã thoát — `CLAUDE.md` đã cảnh báo đúng điểm này |
| POS đăng nhập vào chi nhánh không có tồn `SKU-685` → ảnh chụp rỗng mà vẫn "pass" | `.ai/aidlc.yaml` đã ghim `LOCAL_POS_BRANCH_ID`; kiểm tra giỏ có hàng trước khi chụp |
| Ảnh chụp chứng minh giao diện nhưng không chứng minh DB | Mỗi bước `[DB]` kèm kết quả truy vấn dán thẳng vào báo cáo |

## Definition of done
- [x] AC-21 xanh: không case nào chuyển từ xanh sang đỏ. Một ca đỏ (`promotion-evaluate` AC-03) đã chứng minh là có sẵn trên HEAD; `promotion.mapper.spec.ts` sửa có chủ ý và không chạy được (A-18)
- [x] `07-verification.md` có ảnh cho mọi bước — bước POS chụp headless 2026-09-18 chiều (`POS-01`, `POS-02`), số 706.500 assert từ DOM
- [x] Kết quả truy vấn `invoice_scope` trước/sau có trong báo cáo
- [x] Bản nháp mô tả PR sẵn sàng — `PR-DRAFT.md`
