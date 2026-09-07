---
id: UOW-01
slug: out-of-stock-filter
title: Lọc danh mục hàng hoá theo "hết hàng" tại chi nhánh đang chọn
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09]
risk: medium
status: todo
rollback: bỏ cờ `outOfStock` khỏi thân request v2 ở FE — BE nhận cờ vắng mặt thì sinh đúng câu SQL như trước, không cần deploy lại API
---

# UOW-01 — Bộ lọc "Trạng thái hết hàng"

## Demo script
1. Đăng nhập backoffice, chuyển sang chi nhánh **Hồ Chí Minh**, mở **Danh mục > Hàng hoá**.
   Ghi lại tổng số bản ghi ở thanh phân trang: **2.554**.
2. Bấm **Trạng thái hết hàng**. Tổng còn **1.605**; nút hiện rõ đang bật.
3. Mở màn Tổng hợp tồn kho ở một tab khác, tra một mã bất kỳ trong danh sách vừa lọc và
   xác nhận tồn của nó tại Hồ Chí Minh đúng là ≤ 0.
4. Gõ `Giày MT` vào ô lọc cột **Thương hiệu** — kết quả hẹp lại, và bộ lọc hết hàng vẫn bật
   (chứng minh hai điều kiện giao nhau chứ không thay thế nhau).
5. Xoá ô Thương hiệu, chuyển chi nhánh sang **Chi Nhánh Cần Thơ**. Tổng đổi thành **1.216** —
   đây là bằng chứng bộ lọc theo chi nhánh; nếu thấy **1.015** thì đang tính toàn tổ chức.
6. Sang trang 2, kiểm vài dòng vẫn đều là hàng hết.
7. Bấm lại **Trạng thái hết hàng** để tắt — quay về 2.554.

## In scope
- Trọn đường đọc: DTO nhận cờ → CTE cộng tổng tồn theo chi nhánh → vị từ `≤ 0` → lưới.
- Nút toggle trên thanh công cụ có thể hiện trạng thái bật.

## Not in scope
- Cột hiển thị số tồn trên lưới (A-03).
- Sắp xếp cột trên lưới (`ORDER BY code ASC` đang hard-code) — không thuộc mục QA số 8.

## Risks
| Risk | Mitigation |
| --- | --- |
| Dữ liệu đồng nhất cho dương tính giả: hầu hết nhóm đều hết hàng ở chi nhánh vắng, nên bộ lọc "trông có vẻ chạy" kể cả khi vị từ sai | Chứng minh bằng **hai** chi nhánh cho **hai** con số khác nhau (1.605 vs 1.216), và bằng ca A1=-1/A2=1 dựng riêng |
| `sb.branch_id` là varchar, ép `::uuid` sẽ làm Postgres suy ra hai kiểu mâu thuẫn cho cùng tham số | Giữ cả hai vế kiểu text; đã ghi trong ADR-02 |
| Bật lọc khi đang ở trang cuối ⇒ lưới rỗng | `setPage(1)` khi cờ đổi, giống các handler lọc khác |

## Definition of done
- [x] AC-01..AC-09 pass
- [x] Khi `outOfStock` vắng mặt, SQL sinh ra không đổi so với hiện tại
- [x] Không có `GREATEST(0, …)` / `Math.max(0, …)` trên đường tính tổng
- [x] `pnpm --filter @erp/api test` xanh; `tsc --noEmit` của backoffice sạch
- [x] Demo script chạy được đúng như trên, có ảnh chụp hai con số hai chi nhánh
