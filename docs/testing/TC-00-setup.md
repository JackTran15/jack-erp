# ENV-00 — Môi trường & Dữ liệu Test (Reference)

## Mục tiêu

Tài liệu này mô tả **trạng thái đích** của môi trường trước khi chạy bất kỳ test case nào từ TC-01 đến TC-12. Đây là **reference**, không phải test case — bước tạo dữ liệu chi tiết nằm trong TC-01.

---

## Môi trường


| Mục            | Giá trị                                   |
| -------------- | ----------------------------------------- |
| API URL        | `http://localhost:4000`                   |
| Backoffice URL | `http://localhost:3000`                   |
| POS URL        | `http://localhost:3001`                   |
| Database       | PostgreSQL `erp_test` (hoặc local dev DB) |


Khởi động:

```bash
docker compose up -d        # Postgres, Redis, Redpanda
make dev-api                # NestJS API :4000
make dev-backoffice         # Backoffice :3000
make dev-pos                # POS :3001
```

---

## Cấu trúc dữ liệu test

### 1. Tổ chức (Organization)


| Trường     | Giá trị           |
| ---------- | ----------------- |
| Tên        | `Công ty Giày MT` |
| Trạng thái | ACTIVE            |


> Tạo bằng seed: `pnpm seed:inventory` hoặc tạo thủ công qua tài khoản User Root.

---

### 2. Chi nhánh (Branch)


| ID ngắn  | Tên              | Ghi chú                                     |
| -------- | ---------------- | ------------------------------------------- |
| Branch A | Chi nhánh HCM    | Kho Showroom HCM tự động tạo khi tạo branch |
| Branch B | Chi nhánh Hà Nội | Kho Showroom HN tự động tạo khi tạo branch  |


---

### 3. Kho (Storage)


| Chi nhánh | Tên kho         | Loại                          | isDefaultReceiving | Ghi chú                 |
| --------- | --------------- | ----------------------------- | ------------------ | ----------------------- |
| Branch A  | Showroom HCM    | Showroom (isMainStorage=true) | false              | Tự động tạo cùng branch |
| Branch A  | Kho lưu trữ HCM | Kho phụ                       | **true**           | Tạo thêm; set là kho nhập hàng mặc định |
| Branch B  | Showroom HN     | Showroom                      | false              | Tự động tạo cùng branch |

> **Kho nhập hàng mặc định (isDefaultReceiving=true):** Khi tạo phiếu nhập kho mà không chỉ định kho, hệ thống tự chọn kho này. Mỗi chi nhánh có tối đa 1 kho mặc định.


---

### 4. Vị trí (Location / Bin)


| Kho             | Mã vị trí | Tên           | Ghi chú |
| --------------- | --------- | ------------- | ------- |
| Kho lưu trữ HCM | A-01      | Kệ A - Ngăn 1 |         |
| Kho lưu trữ HCM | A-02      | Kệ A - Ngăn 2 |         |
| Showroom HCM    | SH-01     | Kệ showroom 1 |         |
| Showroom HN     | HN-01     | Kệ HN 1       |         |


> Mỗi kho đã tự có 1 vị trí "Chưa xếp" (isUnassigned=true) và 1 vị trí "Mặc định" (isDefault=true).

---

### 5. Tài khoản Quỹ tiền (Cash Account)


| Chi nhánh | Tên           | Loại     | Ghi chú              |
| --------- | ------------- | -------- | -------------------- |
| Branch A  | Quầy 1 - HCM  | REGISTER | Dùng cho POS session |
| Branch A  | Két chính HCM | SAFE     | Quỹ chính chi nhánh  |


---

### 6. Users


| Email                          | Role              | Chi nhánh    | Ghi chú                                   |
| ------------------------------ | ----------------- | ------------ | ----------------------------------------- |
| `inventory.admin@erp.local`    | Quản trị hệ thống | Tất cả       | **Tài khoản setup** — tạo bằng `pnpm seed:dev-admin` |
| `gm@test.com`                  | Quản lý tổng      | Branch A + B | Tạo thủ công; xem báo cáo toàn hệ thống  |
| `mgr-hcm@test.com`             | Quản lý chi nhánh | Branch A     | Tạo thủ công; quản lý chi nhánh HCM      |
| `staff-hcm@test.com`           | Nhân viên         | Branch A     | Tạo thủ công; bán hàng, chuyển kho tạm   |
| `mgr-hn@test.com`              | Quản lý chi nhánh | Branch B     | Tạo thủ công; dùng cho TC-12 phân quyền  |

> Mật khẩu seed: `password123`. Mật khẩu các user tạo thủ công: tự đặt khi tạo.


---

### 7. Nhóm hàng hoá (Product Groups — 2 cấp)

```
Giày (Level 1)
├── Giày thể thao (Level 2)
├── Giày công sở  (Level 2)
└── Dép / Sandal  (Level 2)

Phụ kiện (Level 1)
├── Tất / Vớ      (Level 2)
└── Chăm sóc giày (Level 2)
```

---

### 8. Hàng hóa (Products & Items)

> **Cách hệ thống gen tên & SKU variant:**
> - **Size only:** Tên = `{Nhóm} {Tên mẫu mã} ({Size})`, SKU = `{base}-{SIZE}` — VD: `Giày thể thao Nam A (38)` / `TSNAM-A-38`
> - **Màu + Size:** Tên = `{Nhóm} {Tên mẫu mã} ({Màu}/{Size})`, SKU = `{base}-{COLORSLUG}-{SIZESLUG}` — VD: `Giày thể thao Nữ B (Đen/35)` / `TSNU-B-DEN-35`
> - **Màu only:** Tên = `{Nhóm} {Tên mẫu mã} ({Màu})`, SKU = `{base}-{COLORSLUG}`
> - `COLORSLUG`/`SIZESLUG` = bỏ dấu, in hoa, chỉ giữ A-Z0-9. VD: "Đen" → `DEN`, "Trắng" → `TRANG`
> - **Tên mẫu mã** phải ngắn (không gồm tên nhóm) để tránh lặp khi hệ thống prepend nhóm.

Tổng 10 sản phẩm, đa dạng về nhóm, variant, đơn vị và giá.

> **Phân biệt Giá mua / Giá bán:**
> - **Giá mua** (`purchasePrice`) = giá vốn mặc định, dùng làm default khi tạo phiếu nhập kho và tính giá vốn trong báo cáo lợi nhuận.
> - **Giá bán** (`sellingPrice`) = giá hiển thị tại POS, ghi vào `InvoiceItem.unitPrice` khi bán.
> - Phiếu nhập kho có thể nhập `unitPrice` khác giá mua mặc định (giá đàm phán lô đó).

**Nhóm: Giày > Giày thể thao**

| SKU mẫu mã | Tên mẫu mã | Variant | Đơn vị | Giá mua | Giá bán | Tên variant sinh ra (VD) |
|------------|------------|---------|--------|---------|---------|--------------------------|
| TSNAM-A | Nam A | Size: 38, 39, 40, 41, 42 | Đôi | 500,000 | 800,000 | `Giày thể thao Nam A (38)` … `(42)` |
| TSNU-B  | Nữ B  | Màu: Đen / Trắng; Size: 35, 36, 37, 38, 39 | Đôi | 400,000 | 650,000 | `Giày thể thao Nữ B (Đen/35)` … `(Trắng/39)` |

**Nhóm: Giày > Giày công sở**

| SKU mẫu mã | Tên mẫu mã | Variant | Đơn vị | Giá mua | Giá bán | Tên variant sinh ra (VD) |
|------------|------------|---------|--------|---------|---------|--------------------------|
| CSNAM-C | Nam C | Size: 39, 40, 41, 42 | Đôi | 750,000 | 1,200,000 | `Giày công sở Nam C (39)` … `(42)` |
| CSNU-D  | Nữ D  | Size: 35, 36, 37, 38 | Đôi | 600,000 | 950,000   | `Giày công sở Nữ D (35)` … `(38)` |

**Nhóm: Giày > Dép / Sandal**

| SKU mẫu mã | Tên mẫu mã | Variant | Đơn vị | Giá mua | Giá bán | Tên variant sinh ra (VD) |
|------------|------------|---------|--------|---------|---------|--------------------------|
| DEP-E | Dép E | Size: 36, 37, 38, 39, 40, 41 | Đôi | 200,000 | 350,000 | `Dép / Sandal Dép E (36)` … `(41)` |

**Nhóm: Phụ kiện > Tất / Vớ**

| SKU mẫu mã | Tên mẫu mã | Variant | Đơn vị | Giá mua | Giá bán | Tên sinh ra |
|------------|------------|---------|--------|---------|---------|-------------|
| TAT-F | Tất thể thao | — | Đôi | 25,000 | 50,000 | `Tất / Vớ Tất thể thao` |
| TAT-G | Tất cotton   | — | Đôi | 15,000 | 30,000 | `Tất / Vớ Tất cotton` |

**Nhóm: Phụ kiện > Chăm sóc giày**

| SKU mẫu mã | Tên mẫu mã | Variant | Đơn vị | Giá mua | Giá bán | Tên sinh ra |
|------------|------------|---------|--------|---------|---------|-------------|
| XIT-H | Bình xịt giày | — | Chai | 70,000 | 120,000 | `Chăm sóc giày Bình xịt giày` |
| KEM-I | Kem đánh giày | — | Hộp  | 25,000 | 45,000  | `Chăm sóc giày Kem đánh giày` |
| BOT-J | Bộ vệ sinh giày | — | Bộ | 120,000 | 200,000 | `Chăm sóc giày Bộ vệ sinh giày` |

> **Tổng SKU:** 5 (TSNAM-A) + 10 (TSNU-B: 2 màu × 5 size) + 4 (CSNAM-C) + 4 (CSNU-D) + 6 (DEP-E) + 1+1+1+1+1 = **34 SKU**  
> Tất cả tồn kho ban đầu = 0.

---

### 9. Khách hàng (Customer)


| Mã     | Tên          | SĐT        | Thẻ thành viên               | Điểm hiện có |
| ------ | ------------ | ---------- | ---------------------------- | ------------ |
| KH-001 | Nguyễn Văn A | 0901234567 | Có (type: Thành viên thường) | 100 điểm     |


> Giá trị 1 điểm = 10,000 VNĐ (cấu hình trong MembershipCardType)

---

### 10. Nhà cung cấp (Supplier / Provider)


| Tên           | Ghi chú                                |
| ------------- | -------------------------------------- |
| NCC Giày Việt | Dùng cho test nhập kho có counterparty |


---

## Cách chuẩn bị môi trường

> **Người thực hiện toàn bộ setup: `inventory.admin@erp.local`** (Quản trị hệ thống — full access).  
> Các user test khác (`gm`, `mgr-hcm`, `staff-hcm`, `mgr-hn`) được tạo thủ công bởi tài khoản này.

**Bước 1 — Khởi tạo tài khoản InventoryAdmin**

```bash
pnpm seed:dev-admin   # tạo inventory.admin@erp.local + org mẫu
```

Đăng nhập `inventory.admin@erp.local` / `password123` vào Backoffice. Tất cả bước tiếp theo thực hiện bằng tài khoản này.

**Bước 2 — Tạo Chi nhánh**
1. Tạo chi nhánh `Chi nhánh HCM` → hệ thống tự tạo kho **Showroom HCM**
2. Tạo chi nhánh `Chi nhánh Hà Nội` → hệ thống tự tạo kho **Showroom HN**

**Bước 3 — Tạo Kho & Vị trí**
3. Vào Branch A → tạo kho `Kho lưu trữ HCM` (loại kho phụ) → bật **Kho nhập hàng mặc định**
4. Trong `Kho lưu trữ HCM` → tạo vị trí: `A-01`, `A-02`
5. Trong `Showroom HCM` → tạo vị trí: `SH-01`
6. Trong `Showroom HN` → tạo vị trí: `HN-01`

**Bước 4 — Tạo Tài khoản Quỹ tiền** (Branch A)
7. Cash Account `Quầy 1 - HCM` (REGISTER)
8. Cash Account `Két chính HCM` (SAFE) — nạp số dư ban đầu ≥ 500,000

**Bước 5 — Tạo Users**
9. `gm@test.com` → role **Quản lý tổng** → gán Branch A + B
10. `mgr-hcm@test.com` → role **Quản lý chi nhánh** → gán Branch A
11. `staff-hcm@test.com` → role **Nhân viên** → gán Branch A
12. `mgr-hn@test.com` → role **Quản lý chi nhánh** → gán Branch B

**Bước 6 – 10 — Tạo Nhóm hàng hoá, Hàng hóa, Nhà cung cấp, Khách hàng**

> Xem chi tiết từng bước tạo tại **[TC-01 — Journey: Thiết lập hệ thống](TC-01-system-setup.md)** (TC-01-006 → TC-01-010).  
> TC-00 chỉ liệt kê trạng thái đích (sections 7–10 ở trên); TC-01 là test case có assertion và edge case.

---

## Sign-off

Sau khi tất cả test cases pass, ký xác nhận tại đây:


| Người test | Ngày | Môi trường | Kết quả |
| ---------- | ---- | ---------- | ------- |
|            |      |            |         |


---

## Báo cáo test

- [report-00 — Kết quả & bugs ENV-00 Setup](report-00.md)
- [report-01 — Kết quả TC-01 Thiết lập hệ thống](report-01.md)

---

## Liên kết nhanh

- [TC-01 — Thiết lập hệ thống](TC-01-system-setup.md)
- [TC-02 — Nhập hàng vào kho](TC-02-goods-receipt.md)
- [TC-03 — Bán hàng POS](TC-03-pos-sale.md)
- [TC-04 — Chuyển kho tạm](TC-04-temp-warehouse.md)
- [TC-05 — Ca làm việc POS](TC-05-pos-session.md)
- [TC-06 — Quỹ tiền](TC-06-cash-vouchers.md)
- [TC-07 — Điều chuyển giữa chi nhánh](TC-07-transfer-order.md)
- [TC-08 — Xuất kho thủ công](TC-08-goods-issue.md)
- [TC-09 — Kiểm kê kho](TC-09-stock-take.md)
- [TC-10 — Đổi trả hàng](TC-10-return-exchange.md)
- [TC-11 — Báo cáo](TC-11-reports.md)
- [TC-12 — Phân quyền](TC-12-rbac.md)

