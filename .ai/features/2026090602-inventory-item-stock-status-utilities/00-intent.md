---
feature: inventory-item-stock-status-utilities
slug: 2026090602-inventory-item-stock-status-utilities
owner: Akenzy
created: 2026-09-06
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Danh mục > Hàng hoá: "Trạng thái hết hàng" + "Tiện ích"

Mục QA số 8 ("Danh mục > Hàng hoá") báo hai nút trên thanh công cụ **chưa có chức năng**.
Đây không phải hai nút còn thiếu — chúng **đã nằm sẵn trên thanh công cụ** và mỗi nút chỉ
bắn một toast "đang được triển khai":

| Nút | Vị trí | Hành vi hiện tại |
| --- | --- | --- |
| **Tiện ích** (`Wrench`) | `apps/backoffice-web/src/lib/list-toolbar/crud-entity-toolbar.ts:105-108` | `soon("Tiện ích đang được triển khai.")` |
| **Trạng thái hết hàng** (`PackageX`) | `apps/backoffice-web/src/lib/list-toolbar/crud-entity-toolbar.ts:110-113` | `soon("Trạng thái hết hàng đang được triển khai.")` |

Vì vậy phạm vi thật của feature là **thay hai hàm `soon()` bằng hành vi thật**, chứ không
phải dựng lại thanh công cụ. Đó cũng là lý do hai việc rất khác nhau về nghiệp vụ lại nằm
chung một feature: chúng dùng chung đúng một màn hình, đúng một nguồn dữ liệu
(`POST /v2/inventory-items/search`), và đúng một mô hình dòng-là-nhóm-sản-phẩm.

## Problem

**P1 — Không lọc được hàng đã hết.** Danh mục hàng hoá của tổ chức dev có 2.554 nhóm
sản phẩm; tại chi nhánh Hồ Chí Minh 1.605 nhóm (≈63%) có tổng tồn ≤ 0. Người dùng không có
cách nào khoanh vùng số đó để đặt hàng lại. Lưới hiện chỉ lọc được theo mã / mã vạch / tên / ĐVT / thương hiệu /
giá / hiển thị POS / trạng thái — **không có một cột tồn kho nào**, nên "hết hàng" không
suy ra được từ dữ liệu đang hiển thị.

Quy tắc nghiệp vụ do người dùng chốt: **cộng dồn tồn của TẤT CẢ biến thể theo sản phẩm
trong chi nhánh đang chọn, tổng ≤ 0 là hết hàng.** Ví dụ của người dùng: `A1 = -1`, `A2 = 1` ⇒ `A = 0` ⇒ vẫn tính là
hết hàng. Hai chi tiết trong ví dụ đó là ràng buộc thật, không phải minh hoạ:
- tồn **âm** được phép và phải được cộng theo dấu (không kẹp `Math.max(0, …)`); trên
  `erp_dev_3008` có 72 dòng `stock_balances.quantity < 0` và 3 nhóm có tổng âm;
- ngưỡng là `≤ 0`, **không phải `< 0`** — nhóm tổng bằng 0 vẫn là hết hàng, và đó là số
  đông: nhóm chưa từng nhập hàng không có dòng `stock_balances` nào cũng phải rơi vào đây.

**P2 — Không đổi được trạng thái kinh doanh hàng loạt.** Cột "Trạng thái" đã hiển thị
`Đang hoạt động` / `Ngừng kinh doanh` (`ActiveStatusBadge`), lưới đã có ô chọn nhiều dòng,
nhưng cách duy nhất để đổi trạng thái là mở từng dòng vào trang Sửa. Với 20.692 mặt hàng
trong một tổ chức, việc ngừng kinh doanh một dòng sản phẩm là thao tác lặp thủ công.

Nghịch lý đáng nói: **backend đã viết xong logic này rồi.**
`InventoryInventoryItemCrudService.setActiveStatus(ids, isActive, actor)`
(`apps/api/src/modules/inventory/location/item-crud.service.ts:214-252`) là một hàm bulk
hoàn chỉnh, kèm sẵn quy tắc chặn "hàng đang ở Showroom thì không được ngừng theo dõi" và
lệnh xoá cache catalog POS. `grep -rn "setActiveStatus" apps/ packages/` trả về **đúng một
kết quả — chính dòng định nghĩa**. Không controller, không test, không caller. Chức năng
thiếu một route HTTP và một menu, không thiếu nghiệp vụ.

## Affected personas

| Persona | Hành vi hiện tại | Hành vi mong muốn |
| --- | --- | --- |
| Nhân viên mua hàng / quản lý danh mục | Xuất Excel toàn bộ danh mục rồi tự cộng tồn ngoài file để biết hàng nào đã hết | Bật "Trạng thái hết hàng" trên lưới, thấy ngay các nhóm tổng tồn ≤ 0 |
| Quản lý chi nhánh / quản trị danh mục | Mở từng mặt hàng vào trang Sửa để đổi `Đang kinh doanh` ⇄ `Ngừng kinh doanh` | Tick nhiều dòng → **Tiện ích** → chọn trạng thái → xác nhận → xong một lượt |

## Success signal

Trên `erp_dev_3008`, tổ chức `f1000000-0000-4000-8000-000000000001`:
1. Bật "Trạng thái hết hàng" khi đang ở chi nhánh **Hồ Chí Minh** trả về **đúng 1.605 nhóm**
   trong tổng 2.554; đổi sang **Cần Thơ** trả về **1.216**. Hai con số khác nhau chính là
   bằng chứng bộ lọc thật sự theo chi nhánh chứ không phải toàn tổ chức (toàn tổ chức là
   1.015 — nếu thấy số này thì phạm vi đang sai). Kết quả phải gồm cả nhóm tổng âm lẫn nhóm
   chưa từng có dòng `stock_balances` nào.
2. Chọn N dòng → Tiện ích → "Ngừng kinh doanh" → cột Trạng thái của **đúng N dòng đó**
   (và mọi biến thể bên trong) đổi sang `Ngừng kinh doanh` sau một lần gọi API, không phải
   N lần.

## Out of scope

- **"Cập nhật ảnh" và "Cập nhật ảnh nhanh"** trong menu Tiện ích của MISA (ảnh tham chiếu
  #2). Người dùng đã khoanh vùng rõ: *"Tiện ích (Hỗ trợ update trạng thái Ngừng kinh doanh,
  Đang kinh doanh)"* — chỉ hai mục trạng thái.
- **Thêm cột tồn kho vào lưới.** Người dùng đã chốt "Trạng thái hết hàng" chỉ là **nút lọc
  bật/tắt**, không kèm cột số. Hệ quả đã được chấp nhận: người dùng không đối chiếu được
  con số tồn ngay trên lưới, muốn xem phải sang màn Tổng hợp tồn kho.
- **Áp dụng Tiện ích cho "toàn bộ kết quả lọc".** Đã chốt: chỉ tác động lên các dòng đang
  tick, tức là trong phạm vi trang hiện tại.
- **Sắp xếp cột trên lưới này.** `search-inventory-items-v2.handler.ts:122` hard-code
  `ORDER BY code ASC` và DTO không có `sortBy`; đó là một thiếu sót có thật nhưng không
  thuộc mục QA số 8.
- **Gỡ trôi `products.is_active` vs `items.is_active` trong dữ liệu cũ.** Đã có 56 sản phẩm
  lệch giữa hai cờ trên `erp_dev_3008`. Feature này phải không làm lệch thêm, nhưng không
  đi vá 56 dòng cũ.
- **Bỏ ràng buộc Showroom** trong `setActiveStatus`. Đó là quy tắc nghiệp vụ đã có chủ đích.

## Constraints

| Kind | Detail |
| --- | --- |
| Dữ liệu | Dòng trong lưới là **nhóm**, không phải mặt hàng: `type: 'product'` ⇒ `id` là `products.id`; `type: 'orphan'` ⇒ `id` là `items.id`. `setActiveStatus` nhận **item id**. Cho thẳng `row.id` vào là no-op im lặng trên mọi dòng `'product'`. |
| Dữ liệu | `items.product_id` **nullable** — 364/41.718 mặt hàng mồ côi. Mọi phép gộp phải có nhánh orphan. |
| Dữ liệu | `stock_balances` khoá `(organizationId, itemId, locationId)`, `quantity` numeric **được phép âm**. Nhóm không có dòng nào ⇒ tổng 0 ⇒ hết hàng, nên phải `LEFT JOIN`, không `INNER JOIN`. |
| UI | `CrudListPage.tsx:337-348` **tự chọn lại dòng đầu** mỗi khi vùng chọn rỗng đi. "0 dòng được chọn" là trạng thái không thể đạt tới ⇒ menu Tiện ích luôn có ít nhất 1 mục tiêu. Bắt buộc phải có hộp thoại xác nhận nêu rõ số dòng, nếu không người dùng sẽ đổi trạng thái nhầm dòng mà không biết. |
| UI | "Chọn tất cả" chỉ phủ **trang hiện tại** (`filteredRecords`), không phủ toàn bộ kết quả server. |
| UI | `ToolbarAction` (`packages/ui/src/components/page-toolbar.tsx:13-38`) chỉ có `variant: "default" \| "danger"` — **không có trạng thái bật/tắt**. Nút "Trạng thái hết hàng" là một toggle nên cần thể hiện trạng thái đang bật. |
| Kiến trúc | Lọc/gộp của lưới này **đã đẩy hết xuống SQL** (`search-inventory-items-v2.handler.ts`, CTE `combined` = nhánh product `UNION ALL` nhánh orphan). Tổng tồn phải cộng vào đúng CTE đó, không kéo 164.481 dòng `stock_balances` lên RAM. |
| Kiến trúc | Endpoint hiện org-scoped, **không nhận `branchId`** (`$1` luôn là `organizationId`). Bộ lọc hết hàng đã chốt là **theo chi nhánh đang chọn**, nên đây là chỗ duy nhất phải bổ sung phạm vi chi nhánh — và chỉ cho vị từ tồn kho, không đụng phạm vi của các cột còn lại. |
| Kiến trúc | `actor.branchId` lấy theo `jwt ?? header` — JWT thắng `X-Branch-Id`. Kiểm thử phải đổi chi nhánh qua UI/`switch-branch`, gửi mỗi header là không đủ. |
| Dữ liệu | `stock_balances.branch_id` là **varchar** còn `storages.branch_id`/`branches.id` là **uuid**. So sánh phải cùng kiểu text ở cả hai vế; ép `$n::uuid` sẽ làm Postgres suy ra hai kiểu mâu thuẫn cho cùng một tham số. |
| Quyền | Đọc `inventory.read`; ghi `inventory.write` (`item-crud.service.ts:1867-1872`). Vai trò SALES chỉ có quyền đọc — không được thấy hành động đổi trạng thái. |
| Idempotency | Endpoint bulk mới là mutation ⇒ tự động chịu `IdempotencyInterceptor` theo `X-Idempotency-Key`. FE phải phát khoá theo thao tác, không phát UUID mới mỗi lần gọi. |

## Existing surface touched

- **Tái sử dụng, không viết lại:**
  - `InventoryInventoryItemCrudService.setActiveStatus` — nghiệp vụ bulk đã có, chỉ thiếu route.
  - `search-inventory-items-v2.handler.ts` CTE `combined` — nơi cộng thêm tổng tồn.
  - `PageToolbar` + `TOOLBAR_REGISTRY` (`constants/toolbar-actions.ts`) — hai action id
    `utilities` / `stockoutStatus` đã đăng ký sẵn nhãn và icon.
  - `CrudListPage` `selectedRows` / `leadingColumn` checkbox — vùng chọn đã có.
  - Mẫu gần nhất cho "chọn N dòng → gọi 1 endpoint bulk": `ItemLocationDetailsPage` +
    `POST /inventory/stock-ledger/balances/tracking` (`stock-ledger.controller.ts:284`).
- **Điểm vào:** không có route mới, không có mục nav mới. Toàn bộ thay đổi FE nằm trong
  lưới `/admin/inventory-items` đã tồn tại.
