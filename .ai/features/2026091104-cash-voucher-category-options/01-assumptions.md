---
feature: cash-voucher-category-options
blocking_open: 0         # count of blocking + pending; must be 0 to pass G1
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | Tên mục chép nguyên văn từ 6 ảnh, kể cả "Làm Hàng" (chữ H hoa) và "Nạp VETC" | high | no | Sửa chuỗi trong constant và migration; tên đã chèn trên prod sửa trên màn danh mục | confirmed | Akenzy chốt 12/09/2026. Demo cùng ngày: dropdown Phiếu chi hiện đúng 34 tên, đọc trực tiếp từ `<option>` chứ không đọc từ ảnh, khớp từng chữ với 6 ảnh (gồm "Làm Hàng", "Nạp VETC") |
| A-02 | Danh mục vẫn phẳng, không thêm nhóm cha, dù hệ thống nguồn của ảnh có tiêu đề nhóm — người dùng yêu cầu "add each option" | high | no | Cần cột nhóm cha, migration schema, dropdown có nhóm: một UoW mới | confirmed | Akenzy chốt 12/09/2026: nghiệm thu demo với 34 mục phẳng, không phát sinh yêu cầu nhóm |
| A-03 | Org đang tồn tại (kể cả prod) được bổ sung bằng migration dữ liệu chạy lúc deploy, không chỉ sửa seed | high | yes | Chỉ sửa seed ⇒ org đang dùng không thấy mục mới (tiền lệ `BANK_FEE` ở My Company) | confirmed | Akenzy chọn "Migration bổ sung" ngày 11/09/2026 |
| A-04 | `CHI_TIEN_NUOC` và `CHI_CCDC` đổi tên tại chỗ (giữ mã, giữ id), chỉ khi tên còn là tên mặc định cũ; phiếu cũ hiển thị tên mới | high | yes | Thêm mục mới ⇒ dropdown có hai mục gần trùng; đổi vô điều kiện ⇒ đè tên org tự đặt | confirmed | Akenzy chọn "Đổi tên tại chỗ" ngày 11/09/2026 |
| A-05 | Thứ tự theo ảnh 1→6; mục không có trong ảnh (Chi trả nợ nhà cung cấp, Phí ngân hàng; Thu nợ khách hàng) xếp cuối loại của nó; dropdown 4 loại phiếu sắp theo `display_order`; chỉ đổi `display_order` còn giá trị mặc định cũ | high | yes | Mục mới nằm cuối dropdown, tách khỏi nhóm | confirmed | Akenzy chọn "Theo thứ tự ảnh" ngày 11/09/2026; mô tả phương án ghi rõ mục hệ thống xếp cuối |
| A-06 | Migration bỏ qua chèn một mục nếu org đã có mục cùng loại, chưa xoá, trùng tên (so `lower(btrim(name))`) dù khác mã | medium | no | Org đó có hai mục trùng tên trong dropdown; tắt một mục trên màn danh mục | confirmed | Akenzy chốt 12/09/2026. Bằng chứng: e2e `cash-voucher-category-backfill`, org B tự tạo "Tiền vận chuyển" mã `VC01` ⇒ migration không chèn `CHI_TIEN_VAN_CHUYEN`, nhưng vẫn chèn các mục mới khác (`CHI_UNG_LUONG`, `CHI_TIEN_NUOC_UONG`) — guard chặn đúng một mục trùng tên. 7/7 xanh |
| A-07 | Mục thu ảnh 7 đã đủ 8/8 mã trong seed và trong cả hai org của `erp_dev_3008`; "add thêm vào mục thu" không cần mã mới — migration lấp cho org nào thiếu | high | no | Nếu ảnh 7 khác danh sách hiện có ở chỗ nào đó (vd tên trên prod) thì thêm mục thu vào constant và migration | confirmed | Akenzy chốt 12/09/2026. Sau migration, `erp_dev_3008`: cả hai org đúng 9 mục thu; demo cho thấy dropdown Phiếu thu tiền mặt **và** tiền gửi hiện đúng 8 tên của ảnh 7 cộng "Thu nợ khách hàng". Không thêm mã thu nào |
| A-08 | Mục mặc định mà org đã xoá mềm không được hồi sinh — khớp `seedForOrganization` (đọc `withDeleted: true`) | high | no | Org thấy lại mục đã xoá; nếu bỏ điều kiện này thì INSERT vỡ UNIQUE `(organization_id, code)` | confirmed | Akenzy chốt 12/09/2026. Bằng chứng: e2e org B, `CHI_TIEP_KHACH` đã xoá mềm vẫn giữ `deleted_at` sau **hai** lần chạy `up()` và không bị chèn lại — `NOT EXISTS` theo `(organization_id, code)` không lọc `deleted_at`, nên vừa không hồi sinh vừa không vỡ UNIQUE |
| A-09 | `inventory.seed.ts` (literal riêng, đã thiếu `BANK_FEE`) ngoài phạm vi | high | no | DB dev dựng mới bằng `seed:inventory` sau khi migrate sẽ thiếu 15 mục; chạy lại migration không giúp vì đã ghi nhận | confirmed | Akenzy chốt 12/09/2026: giữ ngoài phạm vi feature này **và mở plan dọn riêng** cho `inventory.seed.ts` (cho nó đọc `DEFAULT_CASH_VOUCHER_CATEGORIES` như `org-baseline-seed.core.ts`). Ghi rõ trạng thái lúc đóng: seed đó vẫn còn literal 28 mục cũ, chỉ ảnh hưởng DB dev dựng mới, không ảnh hưởng prod |

## Bằng chứng đã xem

- `DEFAULT_CASH_VOUCHER_CATEGORIES` (`cash-voucher-category.seeder.ts`): 9 thu (1–9), 20 chi (10–29).
- `erp_dev_3008`, 11/09/2026: org MT 9 thu / 20 chi; org My Company 9 thu / 19 chi (thiếu `BANK_FEE`); không org nào có
  mã ngoài danh sách mặc định, không org nào đổi tên `CHI_TIEN_NUOC` / `CHI_CCDC`.
- `git log -S BANK_FEE` trên seeder: thêm ở `e52140b6`, không có migration backfill đi kèm.
