---
id: UOW-04
slug: cache-branch-scope
title: Cache báo cáo không trộn phạm vi chi nhánh
demoable: true
duration: 1d
depends_on: []
requirements: [US-04]
verifies: [AC-11]
risk: low
status: todo
rollback: revert 1 commit; khoá cache trở lại org + dto
---

# UOW-04 — Cache báo cáo không trộn phạm vi chi nhánh

## Demo script
1. Đăng nhập tài khoản quản **2** chi nhánh, gọi "Số lượng tồn kho theo cửa hàng"
   (báo cáo không gửi `store` trong payload) → ghi lại tổng số dòng
2. Trong vòng 45 giây, đăng nhập tài khoản chỉ quản **1** chi nhánh, gọi cùng request
3. Tổng số dòng của tài khoản thứ hai chỉ tính chi nhánh của họ
   (trước khi sửa: nhận nguyên bản cache của tài khoản đầu)
4. Lặp lại sau 45 giây với cache đã hết hạn → cùng kết quả

## In scope
- `actor.branchIds` đã sắp xếp đi vào `searchCacheKey`

## Not in scope
- Cache của nhóm Bán hàng / Công nợ / Lợi nhuận — mỗi nhóm có khoá riêng, rà soát riêng
- Bỏ hoặc đổi TTL 45 giây

## Risks
| Risk | Mitigation |
| --- | --- |
| Tỉ lệ trúng cache giảm | Khoá theo tổ hợp phân công, không theo người dùng; tổ chức mà mọi người cùng phân công thì tỉ lệ không đổi |

## Definition of done
- [x] AC-11 pass
- [x] `pnpm --filter @erp/api test`: 305/306 suite xanh — suite đỏ duy nhất là
      `auth.service.spec.ts` (2 test TTL), đã đỏ sẵn trước thay đổi này
- [x] Demoed và accepted ở G4 — Akenzy, 2026-08-29, trên bằng chứng ảnh của
      `08-evidence.md` (7/7 bước xanh, `evidence_check` PASS)

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
> **Không áp dụng cho feature này** — mục "PR draft copied and contact sheets attached"
> được Akenzy gỡ khỏi định nghĩa hoàn thành ngày 2026-08-29: công việc này không đi qua
> PR, và không commit nào được tạo. Bản nháp PR vẫn nằm sẵn ở cuối `08-evidence.md`, kèm
> `evidence/contact-sheet-local-backoffice.png`, dùng được ngay nếu sau này mở PR.
> Ghi lại thay vì xoá: một yêu cầu bị bỏ nên đọc được, không nên biến mất.
