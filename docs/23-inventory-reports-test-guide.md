# Inventory Reports — Hướng dẫn tạo dữ liệu & kiểm thử

Tài liệu này mô tả **luồng nghiệp vụ ERP** cần thực hiện để 7 báo cáo kho có dữ liệu, và các **test case cụ thể** để xác minh từng báo cáo hiển thị đúng.

> Đọc trước: `docs/22-inventory-reports-views.md` (kiến trúc báo cáo).  
> Môi trường: local dev (`make dev-api` + `make dev-backoffice`). Seed ban đầu: `pnpm seed:inventory`.

---

## Phần 1 — Luồng nghiệp vụ ERP để có dữ liệu báo cáo

Thực hiện tuần tự các phase dưới đây. Mỗi phase tạo ra loại ledger entry tương ứng trong bảng `stock_ledger_entries`.

```
Phase 0 → Cài đặt nền (một lần)
Phase 1 → Nhập kho (Goods Receipt)      → movement: PURCHASE_RECEIPT
Phase 2 → Xuất kho (Goods Issue)        → movement: SALE_ISSUE
Phase 3 → Điều chỉnh kho (Adjustment)  → movement: ADJUSTMENT_INCREASE / ADJUSTMENT_DECREASE
Phase 4 → Điều chuyển (Transfer)        → movement: TRANSFER_OUT / TRANSFER_IN
Phase 5 → Kiểm kho (Stock Take)         → movement: ADJUSTMENT_INCREASE / ADJUSTMENT_DECREASE
```

Phiếu nhập, phiếu xuất và phiếu điều chuyển tự động ghi vào `stock_ledger_entries` khi lưu — không còn trạng thái DRAFT. Chỉ phiếu kiểm kho vẫn cần POST thủ công.

---

### Phase 0 — Cài đặt nền

**Mục tiêu:** có đủ danh mục master data cho các phase sau.

Sau khi chạy `pnpm seed:inventory`, hệ thống đã có:
- 1 organization, 1 admin user
- 1 branch mặc định "Main Branch" (bỏ qua khi test)

Tạo 2 branch mới để test (mỗi branch tự tạo kho mặc định cùng tên), sau đó tạo vị trí trong kho:

| Bước | Màn hình | Thao tác |
|------|----------|----------|
| 0-1 | `/admin/branches` | Click **Thêm mới**, điền tên **HN-01**, Save → kho "HN-01" tự tạo |
| 0-2 | `/admin/branches` | Click **Thêm mới**, điền tên **HCM-01**, Save → kho "HCM-01" tự tạo |
| 0-3 | `/inventory/item-locations` (switch sang **HN-01**) | Click **Thêm mới** → Kho: HN-01, Mã: `A01`, Tên: `Khu A`, Loại: bất kỳ, Save |
| 0-4 | `/inventory/item-locations` (switch sang **HCM-01**) | Click **Thêm mới** → Kho: HCM-01, Mã: `A01`, Tên: `Khu A`, Loại: bất kỳ, Save |
| 0-5 | `/admin/inventory-item-categories` | Tạo category **Điện tử** và **Thực phẩm** |
| 0-6 | `/admin/inventory-items` | Tạo **3 items** với `purchase_price` khác 0: |
|      |  | - `SKU-001` / Laptop / category: Điện tử / `purchase_price = 15,000,000` |
|      |  | - `SKU-002` / Bàn phím / category: Điện tử / `purchase_price = 500,000` |
|      |  | - `SKU-003` / Bánh mì / category: Thực phẩm / `purchase_price = 20,000` |

> **Lưu ý:** `purchase_price` bắt buộc phải > 0 cho Report 5 (pivot tồn) và Report 6, 7 (điều chuyển) vì chúng dùng `items.purchase_price` làm cost basis, không dùng ledger `unit_cost`.

---

### Phase 1 — Nhập kho (Goods Receipt)

**Báo cáo ảnh hưởng:** 1, 2, 3, 4

**Switch sang branch HN-01**, vào **Nhập kho → Phiếu nhập**.

| Bước | Thao tác |
|------|----------|
| 1-1 | Tạo phiếu nhập **GR-HN-01** → tự động POSTED |
|     | - SKU-001: số lượng **10**, đơn giá **15,000,000** |
|     | - SKU-002: số lượng **20**, đơn giá **500,000** |
| 1-2 | Tạo phiếu nhập **GR-HN-02** → tự động POSTED |
|     | - SKU-003: số lượng **100**, đơn giá **20,000** |

**Switch sang branch HCM-01**, tạo thêm:

| Bước | Thao tác |
|------|----------|
| 1-3 | Tạo phiếu nhập **GR-HCM-01** → tự động POSTED |
|     | - SKU-001: số lượng **5**, đơn giá **15,200,000** (giá khác HN để test avg) |
|     | - SKU-002: số lượng **10**, đơn giá **510,000** |

Sau bước này, `stock_ledger_entries` có 5 rows với `movement_type = PURCHASE_RECEIPT`.

---

### Phase 2 — Xuất kho (Goods Issue)

**Báo cáo ảnh hưởng:** 1, 2, 3, 4

**Switch sang HN-01**, vào **Xuất kho → Phiếu xuất**:

| Bước | Thao tác |
|------|----------|
| 2-1 | Tạo phiếu xuất **GI-HN-01** → tự động POSTED |
|     | - SKU-001: số lượng **3**, đơn giá **15,000,000** |
|     | - SKU-002: số lượng **5**, đơn giá **500,000** |

Sau bước này, `stock_ledger_entries` có thêm 2 rows với `movement_type = SALE_ISSUE`, quantity âm.

---

### Phase 3 — Điều chỉnh kho (Stock Adjustment)

> ⚠️ **Chưa có giao diện FE.** Backend API tồn tại tại `/inventory/stock/adjustments` nhưng chưa có trang quản lý trên backoffice. Phase này **chưa test được** cho đến khi build UI.

**Báo cáo ảnh hưởng:** 1, 2, 3, 4

**Switch sang HN-01**:

| Bước | Thao tác |
|------|----------|
| 3-1 | Tạo phiếu điều chỉnh **ADJ-HN-01** (DRAFT) |
|     | - SKU-003: số lượng **+50** (tăng thêm 50) |
| 3-2 | POST phiếu ADJ-HN-01 → tạo `ADJUSTMENT_INCREASE` entry |
| 3-3 | Tạo phiếu điều chỉnh **ADJ-HN-02** (DRAFT) |
|     | - SKU-002: số lượng **-2** (giảm 2) |
| 3-4 | POST phiếu ADJ-HN-02 → tạo `ADJUSTMENT_DECREASE` entry |

---

### Phase 4 — Điều chuyển kho (Stock Transfer)

**Báo cáo ảnh hưởng:** 1, 2, 3, 4, 6, 7

**Switch sang HN-01**, vào **Điều chuyển → Phiếu điều chuyển**:

| Bước | Thao tác |
|------|----------|
| 4-1 | Tạo phiếu điều chuyển **TRF-001** → tự động tạo `TRANSFER_OUT` (HN-01) + `TRANSFER_IN` (HCM-01) |
|     | - Nguồn: HN-01 → Đích: HCM-01 |
|     | - SKU-001: số lượng **4** |
|     | - SKU-002: số lượng **3** |
| 4-2 | Tạo phiếu điều chuyển **TRF-002** — **điều chuyển ngược** HCM-01 → HN-01 |
|     | - SKU-001: số lượng **1** |

---

### Phase 5 — Kiểm kho (Stock Take)

Tùy chọn, dùng để kiểm tra trường hợp điều chỉnh từ stock take.

**Switch sang HCM-01**:

| Bước | Thao tác |
|------|----------|
| 5-1 | Tạo phiếu kiểm kho **ST-HCM-01** (DRAFT) |
|     | - Nhập số lượng thực tế cho SKU-001: **11** (hệ thống đang có 5+4-1 = 8, chênh **+3**) |
| 5-2 | Xác nhận / POST phiếu ST-HCM-01 → tạo `ADJUSTMENT_INCREASE` entry (qty = +3) |

---

### Tóm tắt dữ liệu sau 5 phases

| Item | Branch | Nhập | Xuất | Điều chỉnh | Điều chuyển ra | Điều chuyển vào | Tồn cuối |
|------|--------|------|------|-----------|---------------|----------------|---------|
| SKU-001 | HN-01 | 10 | 3 | 0 | 4 | 1 | **4** |
| SKU-002 | HN-01 | 20 | 5 | -2 | 3 | 0 | **10** |
| SKU-003 | HN-01 | 100 | 0 | +50 | 0 | 0 | **150** |
| SKU-001 | HCM-01 | 5 | 0 | +3 (ST) | 1 | 4 | **11** |
| SKU-002 | HCM-01 | 10 | 0 | 0 | 0 | 3 | **13** |

> Số tồn cuối = Nhập + Điều chuyển vào + Điều chỉnh(+) − Xuất − Điều chuyển ra − Điều chỉnh(−)

---

## Phần 2 — Test Cases

Mỗi test case ghi rõ: điều kiện trước, bộ filter cần set, và kết quả kỳ vọng.

**Ký hiệu chung:**
- "period = `this_month`" → date range bao gồm toàn bộ tháng hiện tại
- "Tồn đầu" = tổng ledger trước `startDate` của period
- "Nhập kỳ" = tổng qty dương trong period
- "Xuất kỳ" = tổng qty âm trong period (hiển thị dương)
- "Tồn cuối" = Tồn đầu + Nhập kỳ − Xuất kỳ

---

### Báo cáo 1 — Tổng hợp nhập xuất tồn kho

Route: `/reports/storage/stock-summary`

**TC-01: Tồn đầu kỳ = 0, nhập kỳ → tồn cuối đúng**

Điều kiện: Phase 0–4 đã thực hiện trong tháng hiện tại (chưa có dữ liệu tháng trước).

| Filter | Giá trị |
|--------|---------|
| Period | `this_month` |
| Branch | HN-01 |
| Category | (tất cả) |

Kỳ vọng (3 rows):

| Item | Tồn đầu | Nhập kỳ | Xuất kỳ | Tồn cuối |
|------|---------|---------|---------|---------|
| SKU-001 | 0 | 10+1=**11** (nhập + điều chuyển vào TRF-002) | 3+4=**7** (xuất + điều chuyển ra TRF-001) | **4** |
| SKU-002 | 0 | 20 | 5+3+2=**10** | **10** |
| SKU-003 | 0 | 100+50=**150** | 0 | **150** |

> Điều chuyển vào được tính vào "Nhập kỳ", điều chuyển ra vào "Xuất kỳ".

---

**TC-02: Filter theo category**

| Filter | Giá trị |
|--------|---------|
| Period | `this_month` |
| Branch | HN-01 |
| Category | **Điện tử** |

Kỳ vọng: chỉ hiện SKU-001 và SKU-002 (không có SKU-003 vì category Thực phẩm).

---

**TC-03: Custom date range loại bỏ phiếu cũ**

Tạo thêm phiếu nhập **ngày hôm qua** (ngoài range test) bằng cách dùng custom date chỉ bao gồm hôm nay.

| Filter | Giá trị |
|--------|---------|
| Period | `custom` |
| startDate | hôm nay (yyyy-MM-dd) |
| endDate | hôm nay (yyyy-MM-dd) |
| Branch | HN-01 |

Kỳ vọng: phiếu nhập hôm qua không xuất hiện trong "Nhập kỳ"; nếu đó là phiếu duy nhất, item tương ứng sẽ không có row (hoặc row toàn 0 nếu `hideZeroRows = false`).

---

### Báo cáo 2 — Bảng kê chi tiết phiếu nhập xuất

Route: `/reports/storage/stock-document-details`

**TC-05: Mỗi phiếu POSTED hiện đúng loại chứng từ**

| Filter | Giá trị |
|--------|---------|
| Period | `this_month` |
| Branch | HN-01 |

Kỳ vọng: mỗi phiếu đã POST có ít nhất 1 row. Kiểm tra cột `doc_kind`:

| Phiếu | doc_kind kỳ vọng |
|-------|-----------------|
| GR-HN-01 | `GOODS_RECEIPT` |
| GR-HN-02 | `GOODS_RECEIPT` |
| GI-HN-01 | `GOODS_ISSUE` |
| ADJ-HN-01 | `STOCK_ADJUSTMENT` |
| ADJ-HN-02 | `STOCK_ADJUSTMENT` |
| TRF-001 | `STOCK_TRANSFER` |

---

**TC-07: Search theo mã item lọc đúng**

| Filter | Giá trị |
|--------|---------|
| Period | `this_month` |
| Branch | (tất cả) |
| Search | `SKU-002` |

Kỳ vọng: chỉ hiển thị các rows có `item_code = SKU-002` từ cả HN-01 và HCM-01.

---

### Báo cáo 3 — Chi tiết số lượng nhập xuất tồn

Route: `/reports/storage/stock-quantity-details`

**TC-08: Breakdown theo location khớp tổng Report 1**

| Filter | Giá trị |
|--------|---------|
| Period | `this_month` |
| Branch | HN-01 |

Kỳ vọng: cột tổng cuối kỳ theo từng (item, location) khi cộng lại phải bằng "Tồn cuối" của Report 1 cùng filter. Ví dụ: nếu HN-01 có 1 location `Kho-HN-01`, tổng tồn cuối SKU-001 tại Kho-HN-01 = **4**.

---

**TC-09: Nhiều location trong cùng 1 branch hiện riêng dòng**

Vào `/inventory/item-locations` (switch sang HN-01), tạo thêm vị trí **B01** (Khu B), sau đó nhập 5 unit SKU-001 chỉ định vị trí này qua phiếu nhập mới.

| Filter | Giá trị |
|--------|---------|
| Period | `this_month` |
| Branch | HN-01 |

Kỳ vọng: SKU-001 có **2 dòng** (vị trí A01 và B01), không gộp chung.

---

### Báo cáo 4 — Tổng hợp NXT theo cửa hàng

Route: `/reports/storage/stock-summary-by-branch`

**TC-10: Mỗi branch có dòng tổng hợp riêng**

| Filter | Giá trị |
|--------|---------|
| Period | `this_month` |
| Branch | HN-01, HCM-01 |

Kỳ vọng: 2 nhóm dòng, 1 cho HN-01, 1 cho HCM-01. Số NXT mỗi nhóm khớp tổng từng item.

---

**TC-11: Điều chuyển TRF-001 xuất hiện đối xứng**

| Filter | Giá trị |
|--------|---------|
| Period | `this_month` |
| Branch | HN-01, HCM-01 |
| Item | SKU-001 |

Kỳ vọng:

| Branch | Nhập (điều chuyển vào) | Xuất (điều chuyển ra) |
|--------|----------------------|---------------------|
| HN-01 | 1 (TRF-002) | 4 (TRF-001) |
| HCM-01 | 4 (TRF-001) | 1 (TRF-002) |

Tổng điều chuyển ra HN-01 = tổng điều chuyển vào HCM-01 (phản chiếu). Nếu 2 số này lệch nhau là bug.

---

### Báo cáo 5 — Số lượng tồn theo cửa hàng (Pivot)

Route: `/reports/storage/stock-by-branch`

> Báo cáo này **không có period** — hiển thị tồn kho hiện tại từ `stock_balances`.

**TC-12: Pivot hiện đúng qty hiện tại per branch**

| Filter | Giá trị |
|--------|---------|
| Branch | HN-01, HCM-01 |

Kỳ vọng: mỗi item là 1 row, có 2 cột branch động:

| Item | HN-01 qty | HCM-01 qty | Tổng |
|------|-----------|------------|------|
| SKU-001 | 4 | 11 | 15 |
| SKU-002 | 10 | 13 | 23 |
| SKU-003 | 150 | 0 | 150 |

---

**TC-13: Item tồn = 0 toàn bộ branch bị ẩn**

Tạo item **SKU-004** nhưng không tạo phiếu nhập. `stock_balances` không có row cho SKU-004.

Kỳ vọng: SKU-004 không xuất hiện trong kết quả.

---

**TC-14: Lọc branchIds thu hẹp cột pivot**

| Filter | Giá trị |
|--------|---------|
| Branch | chỉ **HCM-01** |

Kỳ vọng: chỉ hiện 1 cột HCM-01. SKU-003 (chỉ có tại HN-01) không xuất hiện (tồn HCM-01 = 0 → bị ẩn).

---

### Báo cáo 6 — Tổng hợp NX điều chuyển

Route: `/reports/storage/transfer-summary`

**TC-15: Mỗi cặp (nguồn → đích) có 1 dòng tóm tắt**

| Filter | Giá trị |
|--------|---------|
| Period | `this_month` |
| Branch | HN-01, HCM-01 |

Kỳ vọng: 2 rows (TRF-001: HN→HCM, TRF-002: HCM→HN). Kiểm tra:

| Transfer | outQty | inQty | Chênh lệch |
|----------|--------|-------|-----------|
| TRF-001 (HN→HCM) | SKU-001:4 + SKU-002:3 | ≥ outQty nếu đã nhận | 0 nếu đủ |
| TRF-002 (HCM→HN) | SKU-001:1 | 1 | 0 |

---

**TC-16: Điều chuyển nhận một phần → "Chênh lệch" > 0**

Nếu flow điều chuyển có trạng thái IN_TRANSIT (chờ xác nhận nhận hàng) và chỉ nhận được một phần, cột `receivedQty < outQty` → `difference > 0`.

Kiểm tra: tạo TRF-003 (HN→HCM, 10 unit SKU-001), chỉ xác nhận nhận **7 unit**.

Kỳ vọng: `outQty = 10`, `inQty = 7`, `difference = 3`.

---

### Báo cáo 7 — Hàng hoá điều chuyển theo cửa hàng

Route: `/reports/storage/transfer-by-branch`

**TC-17: Filter sourceBranchId = HN-01 chỉ hiện điều chuyển từ HN**

| Filter | Giá trị |
|--------|---------|
| Period | `this_month` |
| sourceBranchId | HN-01 |

Kỳ vọng: chỉ có TRF-001 (HN→HCM) và TRF-003 (nếu đã tạo). Không có TRF-002 (HCM→HN).

---

**TC-18: Giá trị dùng `purchase_price`, không phải ledger unitCost**

GR-HCM-01 nhập SKU-001 với giá **15,200,000** (khác `purchase_price` = 15,000,000).

Sau khi chạy TRF-001 (HN→HCM, SKU-001 qty=4):

| Filter | Giá trị |
|--------|---------|
| Period | `this_month` |
| sourceBranchId | HN-01 |

Kỳ vọng: `avgPrice` của SKU-001 = **15,000,000** (từ `items.purchase_price`), KHÔNG phải 15,200,000. Nếu hiện 15,200,000 là bug — transfer report không dùng ledger `unit_cost`.

---

**TC-19: Breakdown theo item × destination branch**

| Filter | Giá trị |
|--------|---------|
| Period | `this_month` |
| sourceBranchId | HN-01 |

Kỳ vọng: mỗi (item, dest_branch) là 1 row riêng. TRF-001 tạo 2 rows (SKU-001 → HCM-01, SKU-002 → HCM-01).

---

## Phần 3 — Xử lý sự cố thường gặp

| Triệu chứng | Nguyên nhân | Cách kiểm tra |
|-------------|-------------|---------------|
| Report trống, không có dòng nào | Phiếu kiểm kho còn DRAFT | `SELECT * FROM stock_ledger_entries WHERE reference_id = '<doc_id>'` — nếu không có row → phiếu chưa được POST |
| Số liệu cũ hơn 45s so với thực tế | Cache Redis chưa hết TTL | Đổi bất kỳ 1 filter rồi đổi lại → cache miss → fresh data |
| 403 Forbidden | User thiếu permission `inventory.reports.read` | Chạy `pnpm seed:sync-admin-permissions`, logout → login lại |
| 500 "operator does not exist: character varying = uuid" | Câu view join branch_id sai kiểu | Kiểm tra câu query dùng `b.id::text = X.branch_id` |
| Tồn cuối âm | Phiếu xuất vượt quá nhập | Kiểm tra sign của `quantity` trong `stock_ledger_entries` — SALE_ISSUE phải âm |
| Report 5 không có cột branch | `stock_balances` chưa có data | Chạy lại Phase 1–4, verify `SELECT * FROM stock_balances` |
| Report 7 thiếu sourceBranchId | Header `X-Branch-Id` không set | Frontend tự inject từ active branch; nếu gọi API manual thì truyền `sourceBranchId` query param |

---

## Phần 4 — Checklist xác nhận toàn bộ

Sau khi thực hiện Phase 0–5, check từng ô:

- [ ] `stock_ledger_entries` có đủ 5 loại `movement_type`: `PURCHASE_RECEIPT`, `SALE_ISSUE`, `ADJUSTMENT_INCREASE`, `ADJUSTMENT_DECREASE`, `TRANSFER_OUT`, `TRANSFER_IN`
- [ ] Report 1 (HN-01): SKU-001 tồn cuối = 4, SKU-002 = 10, SKU-003 = 150
- [ ] Report 1 (HCM-01): SKU-001 tồn cuối = 11, SKU-002 = 13
- [ ] Report 2: mỗi phiếu nhập/xuất đã lưu đều xuất hiện đúng `doc_kind`
- [ ] Report 3: tổng tồn per location khớp Report 1
- [ ] Report 4: điều chuyển TRF-001 đối xứng giữa HN-01 và HCM-01
- [ ] Report 5: pivot hiện đúng qty per branch, SKU-004 không xuất hiện
- [ ] Report 6: TRF-001 có `difference = 0`, TRF-003 (nếu tạo) có `difference > 0`
- [ ] Report 7: `avgPrice` của SKU-001 = `purchase_price` = 15,000,000
