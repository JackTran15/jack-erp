---
feature: cash-voucher-category-options
blocking_open: 0         # count of blocking + pending; must be 0 to pass G1
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | Tên mục chép nguyên văn từ 6 ảnh, kể cả "Làm Hàng" (chữ H hoa) và "Nạp VETC" | high | no | Sửa chuỗi trong constant và migration; tên đã chèn trên prod sửa trên màn danh mục | pending | — |
| A-02 | Danh mục vẫn phẳng, không thêm nhóm cha, dù hệ thống nguồn của ảnh có tiêu đề nhóm — người dùng yêu cầu "add each option" | high | no | Cần cột nhóm cha, migration schema, dropdown có nhóm: một UoW mới | pending | — |
| A-03 | Org đang tồn tại (kể cả prod) được bổ sung bằng migration dữ liệu chạy lúc deploy, không chỉ sửa seed | high | yes | Chỉ sửa seed ⇒ org đang dùng không thấy mục mới (tiền lệ `BANK_FEE` ở My Company) | confirmed | Akenzy chọn "Migration bổ sung" ngày 11/09/2026 |
| A-04 | `CHI_TIEN_NUOC` và `CHI_CCDC` đổi tên tại chỗ (giữ mã, giữ id), chỉ khi tên còn là tên mặc định cũ; phiếu cũ hiển thị tên mới | high | yes | Thêm mục mới ⇒ dropdown có hai mục gần trùng; đổi vô điều kiện ⇒ đè tên org tự đặt | confirmed | Akenzy chọn "Đổi tên tại chỗ" ngày 11/09/2026 |
| A-05 | Thứ tự theo ảnh 1→6; mục không có trong ảnh (Chi trả nợ nhà cung cấp, Phí ngân hàng; Thu nợ khách hàng) xếp cuối loại của nó; dropdown 4 loại phiếu sắp theo `display_order`; chỉ đổi `display_order` còn giá trị mặc định cũ | high | yes | Mục mới nằm cuối dropdown, tách khỏi nhóm | confirmed | Akenzy chọn "Theo thứ tự ảnh" ngày 11/09/2026; mô tả phương án ghi rõ mục hệ thống xếp cuối |
| A-06 | Migration bỏ qua chèn một mục nếu org đã có mục cùng loại, chưa xoá, trùng tên (so `lower(btrim(name))`) dù khác mã | medium | no | Org đó có hai mục trùng tên trong dropdown; tắt một mục trên màn danh mục | pending | — |
| A-07 | Mục thu ảnh 7 đã đủ 8/8 mã trong seed và trong cả hai org của `erp_dev_3008`; "add thêm vào mục thu" không cần mã mới — migration lấp cho org nào thiếu | high | no | Nếu ảnh 7 khác danh sách hiện có ở chỗ nào đó (vd tên trên prod) thì thêm mục thu vào constant và migration | pending | — |
| A-08 | Mục mặc định mà org đã xoá mềm không được hồi sinh — khớp `seedForOrganization` (đọc `withDeleted: true`) | high | no | Org thấy lại mục đã xoá; nếu bỏ điều kiện này thì INSERT vỡ UNIQUE `(organization_id, code)` | pending | — |
| A-09 | `inventory.seed.ts` (literal riêng, đã thiếu `BANK_FEE`) ngoài phạm vi | high | no | DB dev dựng mới bằng `seed:inventory` sau khi migrate sẽ thiếu 15 mục; chạy lại migration không giúp vì đã ghi nhận | pending | — |

## Bằng chứng đã xem

- `DEFAULT_CASH_VOUCHER_CATEGORIES` (`cash-voucher-category.seeder.ts`): 9 thu (1–9), 20 chi (10–29).
- `erp_dev_3008`, 11/09/2026: org MT 9 thu / 20 chi; org My Company 9 thu / 19 chi (thiếu `BANK_FEE`); không org nào có
  mã ngoài danh sách mặc định, không org nào đổi tên `CHI_TIEN_NUOC` / `CHI_CCDC`.
- `git log -S BANK_FEE` trên seeder: thêm ở `e52140b6`, không có migration backfill đi kèm.
