---
feature: pos-variant-stock-columns
environments: [local-pos]
viewports: [desktop]
ran_by: claude
ran_at: 2026-08-24
environment: erp_dev @ localhost:5433 (docker compose, project `jack-erp`) · API :4000 · pos-web :3001
---

# Verification — Hai cột tồn kho biến thể POS

Ảnh chụp trên dữ liệu thật của `erp_dev`, chi nhánh **Hồ Chí Minh** (`c3bf1922-3a2e-42d9-b00d-a7129efe592c`),
tài khoản `admin@erp.local`. Không dùng `verify.py`'s Steps-table runner cho UoW này — tương tác
cần thiết (tick checkbox đúng dòng theo SKU, gõ SL, đối chiếu tooltip theo dữ liệu) cụ thể hơn 4
động từ chung (`click`/`fill`/`wait`/`scroll`) diễn tả tiện; đi bằng trình duyệt có kiểm soát và
chụp thủ công, ghi lại đầy đủ dưới đây để lặp lại được.

## UOW-01 — Hai cột tồn hiện số thật

### Ảnh 1 — `Tồn cửa hàng khác` ≠ 0 và `Tồn kho` âm (AC-01, AC-07, AC-10)

![Dialog ABA2777, dòng D-38: Tồn cửa hàng khác = 1, Tồn kho = -4](evidence/local-pos/desktop/S1-other-branch-and-negative-showroom.jpg)

Mở dialog biến thể sản phẩm **ABA2777** (product `743e92b4-c003-48dc-95d2-87fda5fa9d5e`, 14 biến
thể). Dòng `ABA2777-D-38` (item `7f71001d-2765-4d5d-9db7-d75fd2a828ae`):

- **`Tồn cửa hàng khác` = 1** — không còn là `0` viết cứng.
- **`Tồn kho` = -4** — số âm hiện nguyên trạng, không bị làm tròn về `0`.

Cùng một dòng chứng minh được cả hai AC vì dữ liệu thật của item này thoả cả hai điều kiện —
không dựng riêng hai dòng.

**Đối chiếu `Tồn cửa hàng khác` bằng SQL** (thay cho việc mở báo cáo tồn kho backoffice, vì con
số cần cộng tay đúng những gì backend cũng cộng — `otherBranchQuantity` chỉ tính chi nhánh
`ACTIVE`, storage `is_active = true`):

```sql
select b.name as branch, s.name as storage, l.name as location, sb.quantity
from stock_balances sb
join locations l on l.id = sb.location_id and l.is_active = true
join storages s on s.id = l.storage_id and s.is_active = true
join branches b on b.id = s.branch_id and b.status = 'ACTIVE'
where sb.item_id = '7f71001d-2765-4d5d-9db7-d75fd2a828ae'
  and sb.is_tracked = true and sb.branch_id <> 'c3bf1922-3a2e-42d9-b00d-a7129efe592c';
```

```
branch  | storage         | location | quantity
Hà Nội  | Kho lưu trữ HN  | A01.01   | 2
Hà Nội  | Kho lưu trữ HN  | A01.03   | -1
```

`2 + (-1) = 1` — khớp đúng số trên dialog. CCC không có tồn cho item này (0 dòng).

### Ảnh 2 — Đã tick, SL = 1, `Tồn kho` = 0, KHÔNG có badge đỏ (AC-10, ADR-02)

![Dialog ABA2799, dòng D-40 đã tick SL=1, Tồn kho=0, không có badge cảnh báo](evidence/local-pos/desktop/S2-no-badge-temp-warehouse.jpg)

Dòng `ABA2799-D-40` (item `0c58675c-a0dd-4561-b890-0ae9e9766b47`, product **ABA2799**
`ea524b45-a922-42c9-bb65-f5b22fdd95d7`): tick chọn, `SL = 1`. `Tồn kho` (mainShowroomQuantity)
hiện `0`, nhưng ô SL **không** có badge cảnh báo đỏ — vì ngưỡng cảnh báo (`sellableQuantity`,
ADR-02) đã cộng thêm 1 đơn vị đang nằm ở kho tạm, chờ chuyển vào showroom.

#### Cách dựng dữ liệu (để lặp lại)

`erp_dev` không sẵn có phiên kho tạm nào đang mở, và tồn showroom của item hiện tại là `0`
booked (không cần điều chỉnh). Mở một phiên kho tạm chiều `warehouse_to_showroom` bằng đúng API
mà `FastStockTransferPage` gọi — không cần hàng thật tồn ở kho nguồn, `addLine` không kiểm tra
tồn tại nguồn:

```bash
# 1. Đăng nhập lấy access token
curl -s -X POST http://localhost:4000/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@erp.local","password":"<mật khẩu trong .ai/credentials.env>","organizationId":"f1000000-0000-4000-8000-000000000001"}'

# 2. Mở dòng w2s cho ABA2799-D-40 — chỉ định rõ 2 storage vì default location resolver
#    của chi nhánh HCM trên erp_dev trùng nhau (bug riêng, không thuộc phạm vi feature này)
curl -s -X POST http://localhost:4000/inventory/temp-warehouse/lines \
  -H "Authorization: Bearer $TOKEN" -H "X-Branch-Id: c3bf1922-3a2e-42d9-b00d-a7129efe592c" \
  -H "Content-Type: application/json" -H "X-Idempotency-Key: <unique>" \
  -d '{"branchId":"c3bf1922-3a2e-42d9-b00d-a7129efe592c",
       "itemId":"0c58675c-a0dd-4561-b890-0ae9e9766b47",
       "direction":"warehouse_to_showroom",
       "warehouseStorageId":"a50db520-408a-40ae-98b3-6ad37bd58b4b",
       "showroomStorageId":"676d5645-04d6-4d69-9399-ed4a1555d483"}'
```

Session mở (id `8fbcfc0b-6a50-4410-bdef-d06dae2035ef`) vẫn để **ACTIVE** — không đóng — để dòng
tiếp tục ở trạng thái "staged", chưa hạ vào `stock_balances`. T-02-05 dùng lại đúng phiên này cho
ảnh tooltip/badge của UOW-02, không dựng lại.

Lưu ý khi chọn item cho kịch bản này: `loadBranchStock`'s stagedDelta chỉ cộng vào item **đã có**
trong map tổng hợp (tức đã có ≥ 1 dòng `stock_balances` ở chi nhánh, dù bằng `0`) — item hoàn
toàn chưa từng có `stock_balances` bị staged delta bỏ qua hoàn toàn. Thử với `ABA2799-D-41`
(không dòng nào) trước, thất bại (`sellableQuantity` vẫn `0`); đổi sang `ABA2799-D-40` — có một
dòng tồn `0` tại vị trí mặc định của showroom — mới ra đúng kịch bản. Đây là hành vi biên chưa
được feature này chạm tới (nằm trong `loadBranchStock`, khoá bởi ADR-01), không phải lỗi cần sửa
ở đây — ghi lại để lần verify sau khỏi mất công dò lại.

## UOW-02 — Hover ô `Tồn kho` ra phân rã theo kho

Không có ảnh tham chiếu người dùng gửi trong session này để đặt cạnh — không thấy file ảnh nào
đính kèm feature này trên đĩa (`00-intent.md`/`02-requirements.md` không nhúng ảnh). Ba ảnh dưới
tự đứng độc lập, đối chiếu bằng số liệu SQL/API thay vì bằng mắt với ảnh gốc.

### Ảnh 3 — Tooltip liệt kê đủ 3 kho, có kho `0` (AC-07, AC-08)

![Tooltip trên ABA2799-D-40: cả 3 kho đều 0, không kho nào bị ẩn](evidence/local-pos/desktop/S3-tooltip-all-storages-zero.jpg)

Hover ô `Tồn kho` của `ABA2799-D-40`. Tooltip liệt kê **cả ba** kho hoạt động của Hồ Chí Minh dù
tồn của item này bằng `0` ở cả ba: `Hồ Chí Minh - Showroom : 0`, `Kho hàng lỗi HCM : 0`,
`Kho lưu trữ HCM : 0` — đúng thứ tự main showroom trước, còn lại theo alphabet (A-10, "hàng" <
"lưu"). Không kho nào bị lọc bỏ vì tồn `0` (AC-07).

### Ảnh 4 — Tooltip trên dòng có showroom âm, khớp với cột ngoài (AC-07, AC-09)

![Tooltip trên ABA2777-D-38: showroom -4, khớp cột Tồn kho ngoài](evidence/local-pos/desktop/S4-tooltip-negative-showroom.jpg)

Hover ô `Tồn kho` của `ABA2777-D-38` (dòng đã dùng ở Ảnh 1). Tooltip: `Hồ Chí Minh - Showroom :
-4`, `Kho hàng lỗi HCM : -1`, `Kho lưu trữ HCM : 3`. `-4` ở dòng showroom khớp đúng con số `-4`
hiện ở cột `Tồn kho` bên ngoài dialog (Ảnh 1) — không có sai lệch làm tròn hay lọc dấu âm.

### Ảnh 5 — Badge cảnh báo đúng/sai theo từng dòng, không theo cột `Tồn kho` (AC-10, AC-11)

![Dialog ABA2799: D-38 có badge đỏ, D-40 không có badge, cùng Tồn kho=0/âm](evidence/local-pos/desktop/S5-badge-contrast.jpg)

Cùng một dialog **ABA2799**, hai dòng tương phản trực tiếp:

- **`ABA2799-D-38`**: tick, SL = 1, `Tồn kho = -2`, **có** badge đỏ — `sellableQuantity = 0` (xác
  nhận qua API), `1 > 0` nên cảnh báo đúng (AC-11).
- **`ABA2799-D-40`**: tick, SL = 1, `Tồn kho = 0`, **không** badge — `sellableQuantity = 1` nhờ
  phiên kho tạm đã dựng ở T-01-08 (session `8fbcfc0b-6a50-4410-bdef-d06dae2035ef`, dòng w2s
  `e77b64e3-aa0f-4ccd-95aa-8502f8325608`, vẫn ACTIVE), `1 ≤ 1` không cảnh báo (AC-10).

Hai dòng cùng nằm trong một dialog, cùng thao tác tick/nhập SL, khác nhau đúng một biến duy nhất
(`sellableQuantity`) — chứng minh trực tiếp rằng badge bám theo ngưỡng dự phóng chứ không bám
theo `Tồn kho` hiển thị.

### Không kiểm ở đây

- Kho `is_active = false` bị loại khỏi tooltip (phần còn lại của AC-08) — đã có unit test ở
  T-02-03 (`pos-catalog-product.service.spec.ts`, case storage deactivated); không dựng lại bằng
  tay trên `erp_dev` vì cần deactivate một storage thật, ảnh hưởng dữ liệu chung.
- Payload phình khi 500 biến thể (ADR-04) — T-02-03 đã đo bằng test, không chụp ảnh.
