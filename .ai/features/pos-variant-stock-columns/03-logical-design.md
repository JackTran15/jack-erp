---
feature: pos-variant-stock-columns
adr_count: 4
---

# Logical design — Hai cột tồn trong dialog chọn biến thể POS

## Approach

Mở rộng payload của endpoint sẵn có `GET /pos/branches/:branchId/catalog/products/:id`
với ba trường mới trên mỗi biến thể, và render chúng trong dialog. Không endpoint mới,
không round-trip mới, không đụng vào `sellableQuantity`.

Điểm mấu chốt của thiết kế: **tách hẳn đường tính "số để hiển thị" ra khỏi đường tính
"ngưỡng cảnh báo"**. `loadBranchStock` — nơi sinh `sellableQuantity`, tài sản chung của
hai feature cảnh báo tồn trước đó — **không bị sửa một dòng nào**. Ba trường mới do một
phương thức riêng `loadDetailStockExtras` sinh ra, chỉ chạy trên đường detail. Hai
phương thức đọc cùng một bảng nhưng trả lời hai câu hỏi khác nhau, và ranh giới đó là
thứ giữ cho `pos-stock-warning-temp-warehouse` không bị hồi quy âm thầm.

## Alternatives rejected

| Option | Why not |
|---|---|
| Thêm cờ vào `loadBranchStock` để nó trả luôn 3 trường mới | Đường list (`listProducts`) cũng gọi phương thức này với **toàn bộ** item của org; nhét thêm nhánh org-wide vào đó là mời một truy vấn khổng lồ vào đường nóng nhất của POS. Chưa kể phương thức đã gánh sẵn nhánh `direction` của fast stock transfer |
| Endpoint riêng `GET .../variants/:id/stock-breakdown` | Dialog phải xử lý thêm một trạng thái loading và một lần fetch nữa cho mỗi lần mở; vi phạm AC-12 mà không đổi lại được gì |
| Dùng `locations` sẵn có cho tooltip | `locations` phân rã theo **vị trí (kệ/ô)**, ảnh tham chiếu liệt kê theo **kho**. Gộp lại ở client thì client phải biết `locationId → storageId`, thứ payload không có |
| Đổi `sellableQuantity` thành số dư thô | Đảo ngược quyết định đã chốt ở `pos-stock-warning-temp-warehouse`: hàng đã quét vào kho tạm để đưa ra quầy sẽ bị báo đỏ oan. User đã chốt giữ nguyên (A-04) |
| Tính tồn chi nhánh khác ở client bằng nhiều lời gọi theo chi nhánh | N+1 theo chi nhánh, và POS không có quyền đọc catalog của chi nhánh mình không thuộc |

## Domain model

| Khái niệm | Nguồn dữ liệu | Ghi chú |
|---|---|---|
| Số dư kho showroom chính | `stock_balances.quantity` ở các `locations` thuộc storage đứng sau `showrooms.is_main_showroom = true` | **Thô** — không kẹp sàn, không cộng kho tạm (A-02, A-03) |
| Tồn chi nhánh khác | `stock_balances` của các `branch_id` thuộc chi nhánh `status = ACTIVE` và ≠ chi nhánh hiện tại, mọi kho đang hoạt động | A-01 |
| Phân rã theo kho | Gộp `stock_balances` theo `locations.storage_id`, trong phạm vi chi nhánh hiện tại | Liệt kê cả kho tồn 0 (A-07) |
| `sellableQuantity` | Không đổi — `loadBranchStock` giữ nguyên | Ngưỡng cảnh báo (A-04) |

### Bộ lọc dữ liệu — một luật, áp cho cả hai đường

1. `stock_balances.is_tracked = true`
2. `locations.is_active = true` (bỏ tồn ở vị trí đã ngừng hoạt động)
3. `storages.is_active = true` (A-08)
4. `branches.status = ACTIVE` — chỉ áp cho phần cross-branch
5. `organization_id` = org của actor, ở **mọi** truy vấn

Ba điều đầu sao chép đúng luật `loadBranchStock` đang dùng (A-09). Nếu luật đó đổi, hai
nơi phải đổi cùng lúc — đây là cái giá đã biết của việc tách đôi, xem ADR-01.

## Contracts

### `GET /pos/branches/:branchId/catalog/products/:id`

Ba trường **thêm** vào `PosProductVariantDto`. Không trường nào bị bỏ hay đổi nghĩa.

```jsonc
{
  "variants": [
    {
      "itemId": "…", "code": "ABA2777-D-39", "sellingPrice": 750000,
      "quantityOnHand": 7,        // KHÔNG ĐỔI — tổng toàn chi nhánh hiện tại
      "sellableQuantity": 2,      // KHÔNG ĐỔI — ngưỡng cảnh báo (showroom + kho tạm, sàn 0)
      "locations": [ … ],         // KHÔNG ĐỔI — phân rã theo vị trí (kệ/ô)

      "mainShowroomQuantity": -1, // MỚI — số dư thô kho showroom chính, cho phép âm
      "otherBranchQuantity": 10,  // MỚI — tổng tồn các chi nhánh ACTIVE khác, mọi kho
      "storages": [               // MỚI — phân rã theo kho, chi nhánh hiện tại
        { "storageId": "…", "name": "Showroom Long Xuyên",  "quantity": -1, "isMainShowroom": true  },
        { "storageId": "…", "name": "Kho Long Xuyên",       "quantity": 2,  "isMainShowroom": false },
        { "storageId": "…", "name": "Kho Lỗi Long Xuyên",   "quantity": 0,  "isMainShowroom": false },
        { "storageId": "…", "name": "Kho Sale Long Xuyên",  "quantity": 0,  "isMainShowroom": false }
      ]
    }
  ]
}
```

Tên `mainShowroomQuantity` được chọn có chủ ý: `showroomQuantity` từng tồn tại trong repo
và đã bị đổi tên thành `sellableQuantity` ở `pos-stock-warning-temp-warehouse`. Tái dùng
đúng cái tên cũ cho một nghĩa **khác** là cách nhanh nhất để người đọc code sau này hiểu
sai.

Failure modes: không có mã lỗi mới. Chi nhánh thiếu showroom chính không phải lỗi —
`mainShowroomQuantity = 0` và `storages` vẫn đầy đủ (A-12, AC-09).

### Truy vấn — đường detail

Đúng **hai** lượt đọc `stock_balances`, cả hai đều hẹp theo `item_id IN (…)`:

| # | Truy vấn | Phục vụ |
|---|---|---|
| 1 | `loadBranchStock(org, branch, undefined, itemIds)` — **giữ nguyên** | `quantityOnHand`, `sellableQuantity`, `locations` |
| 2 | `loadDetailStockExtras(org, branch, itemIds)` — **mới** | `mainShowroomQuantity`, `otherBranchQuantity`, `storages` |

Truy vấn 2 đọc `WHERE organization_id = :org AND item_id IN (:itemIds) AND is_tracked`
— dùng được prefix của unique index `(organization_id, item_id, location_id)`. Kèm ba
lượt đọc metadata nhỏ, cache-friendly: `branches` (status ACTIVE), `storages`
(org, is_active), `showrooms` (org, branch, is_main_showroom).

Không N+1 theo biến thể, không N+1 theo chi nhánh. Toàn bộ gộp nhóm chạy trên RAM bằng
JS, đúng quy ước repo (`feedback_prefer_in_memory_aggregation`).

### Thuật toán `loadDetailStockExtras`

```
activeBranchIds ← branches WHERE org AND status = ACTIVE
storagesById    ← storages WHERE org AND is_active            (cần cả tên lẫn branch_id)
mainShowroomStorageId ← showrooms WHERE org AND branch AND is_main_showroom  → storage_id | null
balances ← stock_balances WHERE org AND item_id IN itemIds AND is_tracked
locById  ← locations WHERE id IN balances.location_id AND org AND is_active

for each balance:
    loc     ← locById[balance.location_id]           ; bỏ qua nếu thiếu
    storage ← storagesById[loc.storage_id]           ; bỏ qua nếu thiếu (kho ngừng hoạt động)
    if storage.branch_id == currentBranch:
        storageTotals[item][storage.id] += qty
        if storage.id == mainShowroomStorageId: mainShowroomQuantity[item] += qty
    else if activeBranchIds.has(storage.branch_id):
        otherBranchQuantity[item] += qty

for each item in itemIds:
    storages[item] ← mọi storage của currentBranch trong storagesById,
                     quantity = storageTotals[item][storage.id] ?? 0
                     sort: isMainShowroom trước, rồi name theo localeCompare('vi')
```

Chi nhánh của một dòng tồn được lấy từ `storage.branch_id` chứ không từ
`stock_balances.branch_id`: kho là thứ thực sự thuộc về chi nhánh, và đi qua storage thì
bộ lọc `is_active` của kho được áp cùng một lượt, không cần lọc hai lần ở hai chỗ.

## State ownership

| State | Owner | Lifetime |
|---|---|---|
| `PosProductDetail` (gồm 3 trường mới) | TanStack Query, key `["catalog","product-detail",branchId,id,kind]` | Vòng đời dialog; đã có sẵn |
| Trạng thái chọn/số lượng từng dòng | `ProductVariantSelectionModal` (local state) | Vòng đời dialog; không đổi |
| Trạng thái mở/đóng tooltip | Radix `Tooltip` dưới `TooltipProvider` đã bọc ở `VariantTable` | Tức thời |

Không thêm store Zustand — dữ liệu server thuộc về TanStack Query
(`feedback_inline_relations_over_root_map`, quy ước React của repo).

## Error taxonomy

| Condition | Xử lý | UI |
|---|---|---|
| Chi nhánh không có showroom chính | `mainShowroomQuantity = 0`, `storages` vẫn đầy đủ | Cột hiện `0`, tooltip bình thường (AC-09) |
| Không có chi nhánh ACTIVE nào khác | `otherBranchQuantity = 0` | Cột hiện `0`, không báo lỗi (AC-05) |
| Chi nhánh hiện tại không có kho nào đang hoạt động | `storages = []` | Không render tooltip; cột vẫn hiện số |
| Item chưa từng có dòng `stock_balances` | Cả ba trường về 0 / mảng rỗng | Giống dòng tồn 0, không phải lỗi |

Không có failure mode mới nào cần map sang HTTP status.

## Cache & offline

`listProducts` cache khung thẻ catalog org-scoped; đường **detail không cache** và
feature này không đổi điều đó — tồn kho phải sống. Ba trường mới đọc thẳng
`stock_balances` mỗi lần mở dialog, giống `sellableQuantity` hôm nay.

POS không có chế độ offline cho dialog này; không có nhánh nào cần xử lý thêm.

## Observability

Không thêm event Kafka (đây là đường đọc thuần). Điều đáng quan sát duy nhất là thời
gian phản hồi của `catalog/products/:id` sau khi thêm truy vấn thứ hai — đo bằng cách so
p95 của endpoint trước/sau trên cùng một product nhiều biến thể (T-01-05).

## ADRs

### ADR-01 — Tách đường "số hiển thị" khỏi đường "ngưỡng cảnh báo"

**Context:** `loadBranchStock` sinh `sellableQuantity`, con số mà hai feature trước đó
(`pos-stock-warning-showroom-only`, `pos-stock-warning-temp-warehouse`) đã dành nhiều
công để định nghĩa cho đúng. Ba trường mới cần dữ liệu chồng lấn với nó.

**Decision:** Không sửa `loadBranchStock`. Ba trường mới do `loadDetailStockExtras` sinh
ra, chạy độc lập, chỉ trên đường detail. Chấp nhận hai lượt đọc `stock_balances` hẹp và
chấp nhận lặp lại bộ lọc `is_tracked` / `is_active`.

**Consequences:** Hồi quy `sellableQuantity` là bất khả thi về mặt cơ học — không dòng
nào của nó bị chạm. Đổi lại, nếu luật lọc chung đổi thì phải sửa hai nơi; rủi ro này
được ghi ngay trong mục "Bộ lọc dữ liệu" phía trên và ràng bằng test ở T-01-04.

**Status:** accepted

### ADR-02 — Số hiển thị và ngưỡng cảnh báo cố ý khác nhau trên cùng một dòng

**Context:** User chốt cột `Tồn kho` hiện số dư thô (cho phép âm), nhưng ngưỡng cảnh báo
vượt tồn giữ `sellableQuantity` (showroom + kho tạm, sàn 0).

**Decision:** Chấp nhận. Một dòng có thể hiện `Tồn kho = -1` mà chọn SL = 1 vẫn không
báo đỏ, khi hàng đang nằm ở kho tạm chờ đưa ra quầy.

**Consequences:** Thu ngân có thể thấy hai con số "không khớp". Tooltip phân rã theo kho
chính là thứ giải thích khoảng chênh đó — nên tooltip không phải tiện ích, nó là một
phần của quyết định này. Hệ quả đã được nêu rõ với user trước khi chốt (A-04). Nếu về
sau thấy gây nhầm, đường lùi rẻ: đổi ngưỡng cảnh báo trong đúng một biểu thức ở
`VariantRow`.

**Status:** accepted

### ADR-03 — "Showroom" ở đây là `showrooms.is_main_showroom`, không phải `storages.is_main_storage`

**Context:** Repo có hai khái niệm "showroom" cùng tồn tại. `resolveBranchItemLocations
(showroomOnly)` — đường POS thực sự trừ hàng — dùng `storages.is_main_storage`. Bảng
`showrooms` là khái niệm còn lại.

**Decision:** Cột `Tồn kho` và cờ `isMainShowroom` trong tooltip bám theo
`showrooms.is_main_showroom`, theo lựa chọn của user.

**Consequences:** Nếu một chi nhánh có nhiều kho `is_main_storage`, hoặc kho showroom
chính không phải kho POS trừ hàng, số hiển thị sẽ lệch với nơi hàng thực sự bị trừ. Kiểm
chứng trên `erp_dev` hôm nay: cả 3 chi nhánh đều có đúng 1 `is_main_storage` và đó cũng
chính là storage của showroom chính → hai định nghĩa đang trùng nhau, rủi ro là lý
thuyết. T-01-04 khoá ràng buộc này bằng một test đọc được, để ngày hai tập lệch nhau thì
test nói trước chứ không phải thu ngân.

**Status:** accepted

### ADR-04 — Mở rộng payload sẵn có thay vì thêm endpoint

**Context:** Ba trường mới chỉ phục vụ một dialog.

**Decision:** Thêm trường vào `PosProductVariantDto` của endpoint detail đang có.

**Consequences:** Payload detail to hơn (mỗi biến thể mang thêm danh sách kho của chi
nhánh — với 500 biến thể × 5 kho là 2500 phần tử nhỏ, chấp nhận được ở mức này). Đổi
lại, dialog không có thêm trạng thái loading nào và AC-12 thoả mãn hiển nhiên. Nếu số
kho mỗi chi nhánh phình lên hàng chục, đường lùi là chuyển `storages` lên mức detail
(một danh sách kho) + map `storageId → quantity` mỗi biến thể.

**Status:** accepted
