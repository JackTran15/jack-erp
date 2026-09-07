---
id: UOW-01
slug: recover-august-fix
title: Bản sửa D1–D5 tháng 8 có mặt trên main
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04]
risk: medium
status: todo
rollback: `git revert` commit cherry-pick — một commit, không đụng mã khác
---

# UOW-01 — Bản sửa D1–D5 tháng 8 có mặt trên main

## Demo script
1. Trên `main`, mở Báo cáo > Kho > "Tổng hợp nhập xuất tồn kho", kỳ 2026, chi nhánh HCM
2. Không lọc nhóm → 9593 dòng
3. Lọc "Nhóm hàng hóa" = "GIÀY DÉP" (nhóm CHA) → ra số > 0, bằng tổng các nhóm lá
4. Lọc = "PHỤ KIỆN" (nhóm ÔNG) → ra số > 0
5. Đặt "Thương hiệu" ở một báo cáo, đổi sang báo cáo không khai dòng đó → số dòng như khi không lọc
6. Gõ vào từng ô lọc cột của cả 8 báo cáo → không toast 400 nào

## In scope
- Đưa `1cb20a60` lên `main` và chứng minh D1–D5 còn hiệu lực sau `#240`/`#246`/`#248`

## Not in scope
- Bốn lỗi mới N1–N4 (UOW-02..UOW-05)

## Risks
| Risk | Mitigation |
| --- | --- |
| Bản cũ đã lệch với `main` (A-05) | T-01-02 chạy lại chính bộ test của commit đó; đỏ ở đâu sửa ở đó, không tắt test |

## Definition of done
- [x] Cả AC-01..AC-04 pass
- [x] 3 conflict được gỡ, `pnpm build` xanh
- [x] `pnpm --filter @erp/api test` xanh
- [x] Evidence probe D1–D5 trên `erp_dev_3008` được ghi lại
