---
feature: inventory-qa-defects
slug: 2026090301-inventory-qa-defects
owner: Akenzy
created: 2026-09-03
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Sửa 4 lỗi QA kho (03/09/2026)

Đợt QA kho báo 4 lỗi trên `erp.giaymt.com.vn`: bộ lọc Tổng hợp tồn kho trả dòng lạ, bộ lọc cột
"Đối tượng" ở Nhập kho lỗi 500, thiếu sắp xếp cột Vị trí ở In tem mã, và vị trí đã ngừng vẫn được
auto-fill. Đây là feature **sửa lỗi**: mọi thay đổi phải truy được về đúng một lỗi đã báo, hoặc về
một chỗ hỏng y hệt trong cùng một hàm dùng chung.

Ba trong bốn lỗi rộng hơn phần QA nhìn thấy, và đó là lý do gộp một feature thay vì bốn lần vá lẻ:
cùng một dòng SQL làm hỏng ba màn hình, và cùng một liên kết dữ liệu cũ làm sai hai chỗ auto-fill.

## Problem

**D1 — Tổng hợp tồn kho: bộ lọc bị bỏ qua trên một khối dòng.** Gõ `DNGUAB064` vào ô "Bộ lọc" trả
về 3 dòng: `DNGUAB064` **hai lần** và `TXV6079` không liên quan. Bộ lọc không sai. Sai ở chỗ
`stock-summary.service.ts:313` bật một truy vấn "sắp nhận về" thứ hai khi đang ở một chi nhánh,
chưa chọn kho, và ở trang 1 — đúng trạng thái trong ảnh. Truy vấn đó (`:402-440`) chỉ lọc 4 điều
kiện: tổ chức, chi nhánh đích, `status = 'IN_PROGRESS'`, chưa xoá. Không có `search`, không có bộ
lọc cột, không cả `item.is_active`. Kết quả được **ghép thêm vào trang đã lọc và đã phân trang**
tại `:575-618`. Khoá chống trùng là `groupKey:storageId`, còn chốt chặn ở `:944-967` chỉ loại
mặt hàng khi đã có tồn **tại đúng kho đích** — nên một SKU nằm ở kho này mà đang về kho kia lọt
qua và thành dòng thứ hai. Badge "Điều chuyển từ cửa hàng khác **1**" trong ảnh chính là lệnh
điều chuyển đang rò ra lưới. Cùng nguyên nhân còn làm **trang 1 trả về nhiều hơn `pageSize`**
(trang ≥2 lại lặng lẽ mất các dòng đó) và làm phồng tổng "Sắp nhận về" ở footer (`:822-843`).

**D2 — Lọc cột "Đối tượng" lỗi 500.** `counterparty-name.util.ts:40-41` dựng tên đối tượng bằng
`CASE` trên ba truy vấn con; nhánh `employee` so `users.organization_id` (**uuid**, `InitSchema:79`)
với `goods_receipts.organization_id` (**varchar**, `AddGoodsReceiptModule:22`). Postgres không có
ép kiểu ngầm `uuid = varchar`, và các nhánh `CASE` bị kiểm kiểu lúc lập kế hoạch — câu lệnh chết
trước khi đọc một dòng nào. Vì thế **mọi** ký tự gõ vào đều 500 dù không hồ sơ nào có
`counterparty_kind = 'employee'`, trong khi 6 bộ lọc cột còn lại chạy tốt vì chúng là cột thường.
Lệch kiểu này là cấu trúc chứ không phải lỗi đánh máy: `BaseEntity` để `organization_id` không khai
kiểu (→ varchar) cho mọi bảng ERP, còn `UserEntity:17` ghi đè thành `uuid`. Bốn chỗ khác trong repo
đã biết và ép kiểu tường minh — `search-deposit-recon-v2.handler.ts:148` còn ghi hẳn comment về
đúng cái bẫy này. **Hàm dùng chung nên Xuất kho (`search-goods-issues-v2.handler.ts:36`) và Chuyển
kho (`search-stock-transfers-v2.handler.ts:35-40`) hỏng y hệt**, cộng một chỗ thứ tư độc lập trong
`TRANSPORTER_NAME_SUBQUERY`. QA chưa gõ vào hai màn đó, không phải chúng đang đúng.

**D3 — In tem mã thiếu sắp xếp cột Vị trí.** Bộ máy đã có sẵn: `line-item-grid.tsx` sắp xếp theo
kiểu controlled (cờ `sortable`, `onSortChange`), lưới không tự đảo dòng — trang đảo. Vướng duy nhất
là `InventoryItemBarcodesPage.tsx:74` khoá cứng `if (sort?.key !== "sku") return list;`.

**D4 — Vị trí đã ngừng vẫn được chào và vẫn được auto-fill.** `MY535-28-D-35` có `A07.02` (Đang
theo dõi, SL 3) và `E03.01` (Ngưng theo dõi, SL 0). In tem mã auto-fill `E03.01`, và dropdown chào
cả hai. Hai lỗi độc lập:

- *Dropdown*: `item-stock-locations.ts:52-57` gọi `GET /inventory/stock/balances` không truyền
  `isTracked`; phía server `getBalances` (`stock-ledger.service.ts:494-499`) chỉ áp `is_tracked` khi
  người gọi yêu cầu, có lọc `storage.is_active` nhưng **không bao giờ lọc `loc.is_active`**. DTO
  cũng không trả `location.isActive` (`:624-630`) nên client không tự lọc được.
- *Auto-fill*: `resolve-item-locations.handler.ts:102-115` nhánh (a) lấy "vị trí ưu tiên" từ
  `item_storage_locations`, có kiểm `loc.is_active = true` nhưng **không kiểm `sb.is_tracked`**, và
  `.getOne()` không `orderBy` nên không tất định. Nhánh (b) — vốn sẽ chọn đúng `A07.02` theo tồn
  cao nhất — không bao giờ chạy tới. Nguyên nhân sâu hơn: `setBalanceTracking`
  (`stock-ledger.service.ts:645-715`) chỉ `UPDATE stock_balances.is_tracked`, **không hề xoá liên
  kết `item_storage_locations`**; repo đã tự ghi chú đúng cái bẫy này tại
  `inventory-location-stock.service.ts:1103-1108`.

Rà rộng ra, cùng một họ lỗi còn ở `CrudFormDialog.tsx:83-93` (thiếu `activeOnly`, trong khi
`searchStorages` ngay bên trên có) và `StockTakeFormDialog.tsx:454-470` (`pageSize: 1` không truyền
`isTracked`, sắp xếp mặc định `loc.code ASC` nên lấy đúng mã kệ đầu bảng chữ cái, ngừng hay không).

## Affected personas

| Persona | Hiện tại | Mong muốn |
| ------- | -------- | --------- |
| Nhân viên kho | Lọc SKU ra dòng lạ và dòng trùng, không tin được số trên lưới | Lọc ra đúng thứ đã gõ |
| Kế toán kho | Lọc cột Đối tượng là màn hình trắng + toast lỗi | Lọc được như 6 cột còn lại |
| Nhân viên in tem | Tem in ra mang vị trí kệ đã bỏ, phải sửa tay từng dòng | Auto-fill đúng kệ đang có hàng |

## Success signal

Chạy lại đúng 4 kịch bản QA, đối chiếu bằng số chứ không bằng cảm nhận:

- Gõ `DNGUAB064` vào ô "Bộ lọc" Tổng hợp tồn kho → đúng **1 dòng**, không có `TXV6079`; số dòng
  trang 1 **≤ `pageSize`**; tổng "Sắp nhận về" ở footer bằng tổng cột trên các trang.
- Gõ bất kỳ ký tự nào vào cột "Đối tượng" ở **cả ba** màn Nhập kho / Xuất kho / Chuyển kho → HTTP
  **200**, không toast lỗi. Một test chạm Postgres thật đỏ trước khi sửa và xanh sau khi sửa.
- In tem mã: bấm tiêu đề "Vị trí" → thứ tự A-Z / Z-A, dòng trống nằm cuối; In / Xuất khẩu / Xem
  trước theo đúng thứ tự đang nhìn.
- `MY535-28-D-35` auto-fill `A07.02`, và `E03.01` không xuất hiện trong dropdown Vị trí.
- `pnpm --filter @erp/api test` xanh.

## Out of scope

- **Xoá liên kết `item_storage_locations` khi Ngừng theo dõi, và migration dọn liên kết cũ.**
  Akenzy chốt 03/09/2026: chỉ chặn ở chỗ đọc, không đụng dữ liệu. Hệ quả được ghi nhận có chủ ý —
  liên kết hỏng vẫn nằm trong DB và mọi chỗ đọc viết sau này phải tự nhớ guard (xem A-05).
- **Ngoại lệ cố ý ở Chuyển kho tạm (POS).** `use-fast-stock-transfer-product-picker.ts:56-58`
  truyền `includeUntracked=true` kèm lý do "cần thấy cả chi tiết đã ngừng theo dõi để dọn hàng".
  Giữ nguyên; đây là tính năng, không phải lỗi.
- **Trang quản trị "Vị trí hàng hóa" và bộ lọc "Tất cả" ở "Chi tiết vị trí".** Phải tiếp tục hiện
  đủ cả vị trí đã ngừng — nếu ẩn thì không ai bật lại được, và lịch sử mất dấu.
- **Chứng từ đã lưu** vẫn hiển thị vị trí đã ngừng của nó. Giao dịch đã post là bất biến.
- **Tab "In tem mã khuyến mại"** — hiện là stub `toast.info("Chưa hỗ trợ...")`
  (`InventoryItemBarcodesPage.tsx:662`). Không thuộc đợt này.
- **Sắp xếp nhiều cột** ở In tem mã. `LineGridSort` là một khoá `{key, direction}`; bấm Vị trí thay
  thế sắp xếp SKU. Muốn "SKU trong Vị trí" thì phải làm tiebreaker, không phải hai state.
- **Chuẩn hoá `organization_id` về một kiểu** trên toàn bộ schema. Đó là gốc của D2 nhưng là một
  migration đụng mọi bảng; đợt này ép kiểu tại chỗ dùng.

## Constraints

- `synchronize: false` — đợt này **không có migration**; mọi thay đổi là logic đọc.
- Backend chỉ tiếng Anh (lỗi, comment, swagger, log); tiếng Việt chỉ ở UI.
- Postgres cục bộ (:5433) đang tắt lúc lập kế hoạch, nên chưa đối chiếu được `DNGUAB064` với dữ
  liệu thật (xem A-01).
- D2 cần **một test chạm Postgres thật**. Cả hai spec hiện có đều mock QueryBuilder và chỉ assert
  `stringContaining`, nên lỗi kiểu SQL vô hình với chúng — đó chính là lý do lỗi này lọt lưới.
- Hai app đều là màn hình quầy/back-office, không có layout mobile: verify desktop-only.

## Existing surface touched

- **Tái dùng làm mẫu**: `findTrackedCandidates` (`inventory-location-stock.service.ts:877-945`) là
  bộ lọc đúng chuẩn (`sb.is_tracked = true AND loc.is_active = true AND loc.is_unassigned = false
  AND storage.is_active = true`); `isBalanceTracked` (`:1109-1119`) là guard đúng cho trường hợp
  "đã gán nhưng chưa từng nhận hàng" — trả `true` khi **chưa có** dòng balance.
- **Tiền lệ trực tiếp**: `.ai/features/branch-deactivation/` (đang ở G4) — cùng dạng "cắm một cột
  đã có sẵn vào mọi chỗ phải tôn trọng nó"; `UOW-02-bien-mat-khoi-o-chon` là bản sao đúng của D4.
  `.ai/features/pos-variant-stock-columns/03-logical-design.md` đã ghi cặp lọc chuẩn.
- **Tiền lệ cho D3**: `1e333745` (thêm sort SKU) và `5512dc98` (In/Xuất khẩu theo sort) — đợt này
  chỉ tổng quát hoá `sortRowsBySku`, `packages/ui` không phải đổi.
- **Điểm vào**: không có route mới; 4 màn hình đã tồn tại.
