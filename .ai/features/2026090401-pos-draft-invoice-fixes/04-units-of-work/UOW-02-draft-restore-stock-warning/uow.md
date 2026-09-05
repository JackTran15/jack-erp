---
id: UOW-02
slug: draft-restore-stock-warning
title: Phiếu mở lại chỉ cảnh báo khi thật sự thiếu hàng
demoable: true
duration: 1d
depends_on: []
requirements: [US-02]
verifies: [AC-06, AC-07, AC-08, AC-09]
risk: low
status: todo
rollback: revert 1 commit; effect quay lại dep cũ
---

# UOW-02 — Phiếu mở lại chỉ cảnh báo khi thật sự thiếu hàng

## Demo script
1. Đăng nhập POS local (:3001), chọn chi nhánh có hàng tồn.
2. Thêm một mặt hàng còn tồn ≥ 1 vào giỏ, bấm "Lưu tạm (F10)".
3. Chờ hơn 30 giây (để catalog hết stale nhưng không refetch), rồi mở lại phiếu đó.
   → Dòng hàng **không** có icon cảnh báo; rê chuột không ra "Chưa xác định được tồn kho".
4. Bấm "Thu tiền (F9)" → đi thẳng, không hiện dialog "Cảnh báo xuất quá số lượng tồn".
5. Lặp lại với một mặt hàng có tồn 1 nhưng phiếu ghi SL 3.
   → Dòng hiện "Hàng hóa quá số lượng tồn", "Thu tiền" hiện dialog cảnh báo với đúng dòng đó.
6. Lặp lại với mặt hàng không có bản ghi tồn ở chi nhánh đang bán.
   → Vẫn hiện "Chưa xác định được tồn kho" (đúng ý A-08).

## In scope
- Selector đếm dòng `onHandUnknown` và đưa vào dep của `useSyncCartOnHand`.

## Not in scope
- Đổi ngưỡng cảnh báo (vẫn là `sellableQuantity` — A-09).
- Giữ chỗ tồn kho cho nháp (A-10 — đã bác).
- Cảnh báo trong dialog chọn biến thể / chuyển kho tạm.

## Risks
| Risk | Mitigation |
| --- | --- |
| Effect chạy vòng lặp vô hạn nếu sync không hội tụ | `syncPurchaseCartOnHand` chỉ `set` khi có thay đổi; T-02-02 test đúng ca "item không có trong catalog" (count đứng yên) |
| Sửa dep làm re-render dư trên màn bán hàng | Dep là số nguyên, không phải mảng/đối tượng |

## Definition of done
- [x] AC-06 và AC-09 đo trực tiếp (A/B với dep cũ ↔ dep mới trên cùng một phiếu, cùng mặt hàng
      còn 10 tồn); AC-07 và AC-08 khoá bằng test store
- [x] Test store pos-web xanh, có ca hội tụ và ca giữ cảnh báo
- [x] Demo bước 1–4 đo bằng A/B thật ở T-02-01 (dep cũ ↔ dep mới, cùng phiếu, cùng mặt hàng
      còn 10 tồn); bước 5–6 khoá bằng 4 test store ở T-02-02

> UoW này **cố ý không nhận khối "Verification evidence"** — đây là ghi chú, không phải việc còn
> nợ. Trên `erp_dev` mọi mặt hàng đều có tồn showroom 0, nên trạng thái trước-sửa (chưa-biết-tồn)
> và sau-sửa (tồn thật = 0) cho ra cùng một icon đỏ; chỉ chữ trong tooltip khác, mà runner không
> có động từ `hover`. Một bước trình duyệt ở đây sẽ xanh vô điều kiện, tức tệ hơn không có.
> Xem `07-verification.md` mục "Not verified here".
- [ ] Chưa commit
