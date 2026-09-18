---
feature: ctkm-item-discount-invoice-scope
environments: [local-backoffice, local-pos]
viewports: [desktop]
run_by: Claude (phiên 2026-09-18) — backoffice đăng nhập do Akenzy thực hiện thủ công; POS chạy headless bằng `capture-pos-evidence.py`
database: erp_dev (backoffice, buổi sáng) / erp_dev_3008 (POS, buổi chiều — xem "Bước POS")
---

# Kiểm chứng trên trình duyệt — CTKM giảm giá hàng hóa + phạm vi hóa đơn

## Cách chạy

Chạy **thủ công qua Chrome**, không qua `aidlc-verify`. Lý do ghi lại để lần sau
khỏi dò lại: `aidlc-verify --doctor` trả `rung: skipped` vì hai môi trường
`local-backoffice-bm` và `local-backoffice-wh` đang `required: true` nhưng thiếu
`LOCAL_BACKOFFICE_BM_*` / `LOCAL_BACKOFFICE_WH_*` trong `.ai/credentials.env`.
Hai môi trường đó thuộc feature phân quyền khác, không liên quan gì tới feature
này, nhưng một env `required` thiếu phiên kéo cả rung xuống `skipped`.

Phiên đã lưu ở `.ai/.auth/local-backoffice.json` (16/09) cũng **hỏng**: nó thuộc
org `e60e5f49-304d-4eb1-9735-3a2d10ba288f` với **0 quyền**, nên app vẫn "đăng nhập
được" nhưng sidebar trống và mọi route CTKM bật về `/`. Đã xoá `localStorage` để
lấy lại trang đăng nhập sạch; Akenzy tự nhập mật khẩu.

## Môi trường thực tế

| Thứ | Giá trị |
| --- | --- |
| Backoffice | http://localhost:3000 (Vite dev, đang chạy sẵn) |
| API | http://localhost:4000 (`pnpm dev`) |
| **Database** | **`erp_dev`** — xem cảnh báo bên dưới |
| Org | `f1000000-0000-4000-8000-000000000001` (My Company) |
| Chi nhánh | Hồ Chí Minh |
| Khung nhìn | desktop 1440×900 |

> **Bẫy cấu hình đáng sửa.** `apps/api/.env` khai `DB_NAME` **hai lần** — dòng 8
> `erp_dev`, dòng 45 `erp_clone_prod`. dotenv lấy dòng **đầu** nên app chạy trên
> `erp_dev`; còn shell `set -a; . apps/api/.env` lấy dòng **cuối** và trỏ vào
> `erp_clone_prod` (không tồn tại trên máy này). `.env` ở gốc repo khai
> `erp_dev_3008` nhưng bị `apps/api/.env` che hoàn toàn, vì `envFilePath` ưu tiên
> file đầu tiên định nghĩa khoá. Ba nguồn, ba câu trả lời khác nhau.

## Số liệu DB trước khi chạy

```sql
SELECT type, COALESCE(invoice_scope::text,'(NULL)'), count(*)
FROM promotion_programs WHERE deleted_at IS NULL GROUP BY 1,2;
```

| type | scope | count |
| --- | --- | ---: |
| INVOICE_DISCOUNT | NON_PROMO_ONLY | 4 |
| ITEM_DISCOUNT | (NULL) | 1 |
| GIFT_ITEM | (NULL) | 1 |

Không có CTKM **còn sống** nào ở `ALL_ITEMS` — bản `ALL_ITEMS` duy nhất đã bị
xoá mềm. Nói cách khác, trước đợt này chưa có chương trình nào đang giảm chồng.

## Số liệu DB sau khi chạy

| type | scope | count | thay đổi |
| --- | --- | ---: | --- |
| INVOICE_DISCOUNT | NON_PROMO_ONLY | 5 | +1 (`KM000011`, tạo qua form, **mặc định mới**) |
| INVOICE_DISCOUNT | ALL_ITEMS | 1 | +1 (`KM000012`, người dùng **chủ động chọn**) |
| ITEM_DISCOUNT | (NULL) | 1 | không đổi |
| GIFT_ITEM | (NULL) | 1 | không đổi |

Bốn CTKM `NON_PROMO_ONLY` có sẵn không bị đụng tới.

---

## AC-01 — Menu "Thêm mới" mở đúng 2 hình thức ✅

Bấm **Thêm mới** → menu con hiện đúng *Giảm giá hóa đơn* và *Giảm giá hàng hóa*.
*Giảm giá theo mức*, *Tặng hàng hóa*, *Mua m tặng n* vẫn ẩn (A-04).

![AC-01](evidence/AC-01-menu-them-moi.png)

## AC-02 — Chọn "Giảm giá hàng hóa" mở đúng variant ✅

URL `/promotions/programs/new?type=PRODUCT_DISCOUNT`, tiêu đề *"Thêm mới giảm giá
hàng hóa"*, có mục **KHUYẾN MẠI** với lưới chọn *Nhóm hàng hóa / Hàng hóa*.
Không có mục *Phạm vi áp dụng* — đúng, mục đó chỉ thuộc giảm giá hóa đơn.

![AC-02](evidence/AC-02-form-giam-gia-hang-hoa.jpg)

## AC-22 — Radio "Phạm vi áp dụng" trở lại, mặc định đúng chiều ✅

Form thêm mới *Giảm giá hóa đơn* có lại mục **PHẠM VI ÁP DỤNG** với 2 lựa chọn,
**"Chỉ hàng hóa chưa áp dụng khuyến mại" được chọn sẵn**.

![AC-22](evidence/AC-22-radio-mac-dinh-zoom.png)
![AC-22 toàn trang](evidence/AC-22-form-hoa-don-mac-dinh.jpg)

## AC-23 — Cảnh báo giảm chồng ✅

Chọn *Tất cả hàng hóa trong hóa đơn* → hiện dòng cảnh báo kèm icon:

> ⚠ Phần giảm sẽ tính trên **cả** những mặt hàng đã được chương trình khuyến mại
> khác giảm giá, tức là giảm chồng lên nhau.

Chọn lại *Chỉ hàng hóa chưa áp dụng khuyến mại* → cảnh báo biến mất. Cảnh báo
**không chặn lưu** (chứng minh ở AC-15 bên dưới: KM000012 lưu được trong lúc cảnh
báo đang hiện).

![AC-23](evidence/AC-23-canh-bao-zoom.png)
![AC-23 toàn trang](evidence/AC-23-canh-bao-full.jpg)

## AC-15 — Đường ghi phạm vi, đọc lại từ DB ✅

Hai chiều, cả hai đều tạo qua form thật rồi `SELECT` lại:

| Mã | Thao tác | `invoice_scope` trong DB |
| --- | --- | --- |
| `KM000011` | Thêm mới, **không chạm** radio | `NON_PROMO_ONLY` |
| `KM000012` | Thêm mới, **chủ động chọn** *Tất cả hàng hóa* | `ALL_ITEMS` |

`KM000011` là bằng chứng trực tiếp rằng khóa tháng 8 đã được gỡ: trước thay đổi
này, đường ghi hardcode `ALL_ITEMS` nên không thao tác nào trên UI tạo ra được một
dòng `NON_PROMO_ONLY`. `KM000012` là bằng chứng lựa chọn của người dùng vẫn được
tôn trọng — mặc định mới không ép cứng.

```
 code    | name                                      | scope
---------+-------------------------------------------+-----------------
 KM000012| AC-15 chon ALL_ITEMS co canh bao - claude | ALL_ITEMS
 KM000011| AC-15 mac dinh khong cham radio - claude  | NON_PROMO_ONLY
```

## AC-17 — Sửa bản ghi cũ không âm thầm đổi phạm vi ✅

Mở lại `KM000012` (đang `ALL_ITEMS`):
- Radio hiện đúng **Tất cả hàng hóa trong hóa đơn** — mặc định `NON_PROMO_ONLY`
  của form thêm-mới **không** đè lên giá trị đang lưu (ADR-03).
- Cảnh báo AC-23 cũng hiện trên bản ghi đã lưu.
- Đổi **mỗi tên** rồi Lưu → `PUT` 200.

| Mã | name sau khi sửa | scope | updated_at |
| --- | --- | --- | --- |
| `KM000012` | `AC-17 doi ten thoi - claude` | **`ALL_ITEMS`** (không đổi) | 07:18:51 |

![AC-17](evidence/AC-17-sua-ban-ghi-all-items.jpg)

---

## Bước POS — đối chiếu số học trên màn hình thu ngân ✅

Chạy **headless** bằng `capture-pos-evidence.py` (cùng thư mục), không qua
`aidlc-verify` vì recipe `form` của runner không điền được form POS 3 ô (đã ghi
trong `.ai/aidlc.yaml`). Script tự đăng nhập bằng `LOCAL_BACKOFFICE_*` trong
`.ai/credentials.env`, ghim chi nhánh **Hồ Chí Minh**, gõ SKU vào ô tìm kiếm
(khớp SKU tuyệt đối thì tự thêm dòng — `ProductSearchInput.tsx`) và **assert số
từ DOM** trước khi thoát 0: ảnh sai số thì script đỏ.

```
~/.venvs/aidlc-verify/bin/python .ai/features/2026091803-ctkm-item-discount-invoice-scope/capture-pos-evidence.py
logged in: http://localhost:3001/pos/
after SKU-685: Còn phải thu = 616.500
after SKU-685 + SKU-100: Còn phải thu = 706.500
RESULT: PASS
```

> **API đang chạy trên `erp_dev_3008`, không phải `erp_dev`.** Tiến trình trên
> `:4000` (`node dist/main`, khởi động 14:36) ghi vào `erp_dev_3008` — chính cái
> bẫy `DB_NAME` ba nguồn đã cảnh báo ở trên, lần này rơi về `.env` gốc repo.
> Phát hiện vì `POST /v2/promotions` trả 201 mà `SELECT` trên `erp_dev` không
> thấy dòng nào. Toàn bộ bước POS vì thế nằm trên `erp_dev_3008`; ảnh backoffice
> buổi sáng vẫn thuộc `erp_dev` như đã ghi.

### Fixture dựng cho bước này (trên `erp_dev_3008`, đều mang hậu tố `- claude`)

`SKU-685` / `SKU-100` không có thật trong DB dev — chúng là fixture của e2e
(`promotion-seed.ts`), và e2e **xoá sạch** `promotion_programs` trước mỗi case.
Con số 706.500 chỉ tái hiện được khi đúng hai CTKM của AC-10 cùng chạy, nên dựng
lại y hệt kịch bản đó:

| Thứ | Cách tạo | Giá trị |
| --- | --- | --- |
| Hàng `SKU-685` — *Giày nữ 685 - claude* | `INSERT INTO items` | 685.000 |
| Hàng `SKU-100` — *Phụ kiện 100 - claude* | `INSERT INTO items` | 100.000 |
| `KM000003` — CTKM-A | `POST /v2/promotions` (đường ghi `ITEM_DISCOUNT` vừa mở lại) | giảm 10% trên `SKU-685`, `priority: 1` |
| `KM000004` — CTKM-B | `POST /v2/promotions` | giảm hóa đơn 10%, `invoice_scope = NON_PROMO_ONLY`, `priority: 1` |

`priority: 1` để hai chương trình này thắng mọi CTKM có sẵn khi tranh cùng
tài nguyên; trên `erp_dev_3008` thực tế không còn CTKM sống nào khác (hai bản
`KM000001/2` đã xoá mềm từ trước).

### Kiểm chéo qua API trước khi chụp

`POST /v2/promotions/evaluate` (chi nhánh Hồ Chí Minh):

| Giỏ | subtotal | Áp dụng | Giảm | amountAfterPromotion |
| --- | ---: | --- | ---: | ---: |
| `SKU-685` | 685.000 | KM000003 → L685 68.500; KM000004 **bỏ qua** `CONDITION_NOT_MET` | 68.500 | **616.500** |
| `SKU-685` + `SKU-100` | 785.000 | KM000003 → L685 68.500; KM000004 → **chỉ L100** 10.000 | 78.500 | **706.500** |

Dòng đầu chính là AC-11 (mọi dòng đã bị chiếm thì hóa đơn không áp) nhìn từ POS.

### UOW-01 bước 6 — giỏ `SKU-685`: còn phải thu 616.500 ✅

Tổng tiền 685.000, Khuyến mại −68.500, **Còn phải thu 616.500**.

![POS SKU-685](evidence/POS-01-sku685-616500.png)

### UOW-03 bước 4 / AC-10 — giỏ `SKU-685` + `SKU-100`: còn phải thu 706.500 ✅

Tổng tiền 785.000, Khuyến mại −78.500, **Còn phải thu 706.500** — không phải
638.000 của cách tính chồng cũ.

![POS SKU-685 + SKU-100](evidence/POS-02-sku685-sku100-706500.png)

Dấu chấm than đỏ cạnh mỗi dòng là cảnh báo hết tồn (hai hàng fixture không nhập
kho); POS cho bán khống nên không chặn và không liên quan tới số học CTKM.

### Vì sao màn hình không "hiện" hai CTKM — và hóa đơn thật có cả hai

Câu hỏi của Akenzy sau ảnh POS-02: *"tại sao không hiển thị khuyến mãi nào trên
UI?"* Ảnh đó **chính là** giỏ vừa giảm hàng hóa vừa giảm hóa đơn, nhưng POS
không nói ra điều đó ở đâu cả — đây là thiết kế có sẵn của pos-web, không phải
feature này:

- Panel thanh toán gom mọi CTKM đã áp vào **một** dòng *Khuyến mại −78.500*
  (`buildPromotionRowLabel` chỉ ghi "(X%)" khi đúng một CTKM hóa đơn kiểu %).
- Dòng hàng `SKU-685` vẫn hiện 685.000 / 685.000: `InvoiceLineItemRow` chỉ vẽ
  giảm giá **tay** của thu ngân (`line.lineDiscount`), không vẽ `lineDiscounts`
  của CTKM.
- Bảng kê theo chương trình nằm ở modal **Chương trình khuyến mãi** (icon quà
  cạnh ô khách hàng, `aria-label="Voucher / quà tặng"`): tên + hình thức +
  *Đã áp dụng*, nhưng **không có số tiền** từng chương trình.

![Modal Khuyến mãi — 2 chương trình Đã áp dụng](evidence/POS-03-modal-khuyen-mai-2-chuong-trinh.png)

**Thu tiền thật** (`capture-pos-evidence.py --checkout`, tắt *In hóa đơn*, trả
lời "Có" ở hộp bán vượt tồn) → hóa đơn `2609180001` trạng thái `paid`:

| bảng | giá trị |
| --- | --- |
| `invoices` | `subtotal` 785.000 · `discount_amount` **78.500** · `amount_due` **706.500** |
| `invoice_checkout_promotions` | `KM000003` ITEM_DISCOUNT **68.500** → dòng SKU-685, `unitPriceAfter` 616.500 |
| | `KM000004` INVOICE_DISCOUNT **10.000** → **chỉ** dòng SKU-100, `unitPriceAfter` 90.000 |

![Sau Thu tiền](evidence/POS-04-sau-thu-tien.png)

> ⚠️ **Phát hiện lúc thu tiền — POS `:3001` đang chạy luồng checkout cũ, và luồng
> đó không biết CTKM.** `apps/pos-web` không có `.env`, `VITE_CHECKOUT_V2` không
> đặt, nên `invoice.service.ts` gọi `POST /invoices/:id/checkout` (v1).
> `CheckoutInvoiceService` tính `amountDue` từ `invoice.discountAmount` của
> draft — bằng **0**, vì draft không mang CTKM — tức server đòi **785.000** trong
> khi màn hình bảo thu ngân thu **706.500**. Kết quả: `400 "Invoice must have a
> customer when there is a remaining debt balance"` (server hiểu 78.500 chênh
> lệch là nợ), POS đứng im, để lại draft `DRAFT-1789720453422/…496149/…561105/…623922`.
> Bật cờ (`VITE_CHECKOUT_V2=true`, ở đây là một vite thứ hai trên `:3002`) thì
> `/v2/pos/checkout` đi qua `evaluate-promotion.step` và ghi đúng 706.500 như
> bảng trên — trùng với e2e AC-18. Nói cách khác: **mọi CTKM trên POS chỉ thu
> tiền được khi cờ v2 bật**.
>
> **Đã xử lý ngay sau khi đóng G5.** Production đã chạy `VITE_CHECKOUT_V2=true`
> (Akenzy xác nhận), nên máy dev chỉ thiếu file: tạo lại `apps/pos-web/.env`
> với cờ đó (gitignore, không commit) và ghi mẫu vào `.env.example` gốc để máy
> sau khỏi lặp lại. Không đổi code — bản đảo mặc định trong `invoice.service.ts`
> đã thử rồi **revert** vì production vốn dùng cờ. Vite `:3001` tự restart khi
> `.env` đổi; chạy lại `--checkout` trên `:3001`: hóa đơn `2609180003` `paid`,
> 78.500 / 706.500, hai dòng snapshot y hệt `2609180001`.

### Giảm giá **từng dòng** trên POS — ở đâu thấy được, ở đâu không

Câu hỏi tiếp của Akenzy: *"chưa thấy test evidence giảm giá từng line trên POS?"*
Ba tầng, hai tầng có bằng chứng, một tầng POS không vẽ:

**1. Màn hình thu ngân — không vẽ.** `InvoiceLineItemRow` chỉ hiện giảm giá
tay (`line.lineDiscount`); dòng SKU-685 vẫn 685.000 / 685.000 dù CTKM đã lấy
68.500 của nó. Không có gì để chụp ở đây — đó là khoảng trống UI, không phải
lỗi tính toán.

**2. Hóa đơn in — tách theo loại, không theo dòng.** *In tạm tính* (và hóa đơn
in sau Thu tiền, cùng `renderInvoiceHtml`) tách *Khuyến mãi 78.500* thành
**KM theo mặt hàng 68.500** và **KM theo hóa đơn 10.000**; bảng hàng vẫn in đơn
giá gốc. Đây là chỗ duy nhất thu ngân/khách nhìn thấy hai CTKM là hai khoản.
`capture-pos-evidence.py --receipt` lấy HTML từ iframe in (headless: stub
`window.print`), mở lại và assert từng `div.row`:

```
Tiền hàng 785.000
Khuyến mãi 78.500
KM theo mặt hàng 68.500
KM theo hóa đơn 10.000
Tổng thanh toán: 706.500
receipt breakdown: PASS
```

![In tạm tính](evidence/POS-05-in-tam-tinh.png)

**3. Từng dòng — engine và DB, là nguồn sự thật.** Cùng giỏ, `POST
/v2/promotions/evaluate` trả `lineDiscounts` cho từng CTKM, và hóa đơn
`2609180003` lưu y hệt trong `invoice_checkout_promotions.line_discounts`
(join `invoice_items` để ra mã hàng):

| CTKM | loại | dòng | đơn giá | giảm | giá sau |
| --- | --- | --- | ---: | ---: | ---: |
| `KM000003` | ITEM_DISCOUNT | `SKU-685` | 685.000 | **68.500** | **616.500** |
| `KM000004` | INVOICE_DISCOUNT | `SKU-100` | 100.000 | **10.000** | **90.000** |

`KM000004` **không có** dòng nào cho `SKU-685` — chính là BR-002 nhìn ở mức
dòng: hóa đơn chỉ chạm hàng chưa được CTKM nào giảm.

```sql
SELECT p.code, p.type, ii.item_code, ii.unit_price,
       (ld->>'discountAmount')::int AS giam, (ld->>'unitPriceAfter')::int AS gia_sau
FROM invoices i
JOIN invoice_checkout_promotions p ON p.invoice_id = i.id
CROSS JOIN LATERAL jsonb_array_elements(p.line_discounts) ld
JOIN invoice_items ii ON ii.id = (ld->>'lineId')::uuid
WHERE i.code = '2609180003';
```

Muốn thu ngân thấy giá sau CTKM ngay trên dòng hàng (tầng 1) là feature UI
riêng — dữ liệu đã có sẵn trong `appliedPrograms[].lineDiscounts` của preview,
chỉ thiếu chỗ vẽ.

### `invoice_scope` trên `erp_dev_3008` sau bước POS

| type | scope | count |
| --- | --- | ---: |
| INVOICE_DISCOUNT | NON_PROMO_ONLY | 1 (`KM000004`, mới) |
| ITEM_DISCOUNT | (NULL) | 1 (`KM000003`, mới) |

---

## Dữ liệu để lại

- `erp_dev`: hai CTKM kiểm thử **mới tạo** `KM000011`, `KM000012` (buổi sáng).
- `erp_dev_3008`: hai hàng `SKU-685`, `SKU-100` và hai CTKM `KM000003`, `KM000004`
  (bước POS). Hai hàng chưa có tồn kho ở bất kỳ chi nhánh nào — hóa đơn
  `2609180001`, `2609180002`, `2609180003` (`paid`, 706.500) vì thế là ba lần bán vượt tồn,
  cộng 4 draft `DRAFT-1789720…` từ các lần Thu tiền v1 bị 400.

Tất cả đặt tên có hậu tố `- claude` cho dễ nhận. Không CTKM hay hàng hóa nào có
sẵn bị sửa hay xoá (A-03). Xoá đi bất cứ lúc nào nếu không cần giữ làm bằng chứng;
`capture-pos-evidence.py` dựng lại được ảnh POS chừng nào fixture còn.

## Chưa kiểm chứng ở đây

- **AC-09, AC-12..AC-14, AC-16, AC-18..AC-21** — thuộc tầng API/engine, chứng minh
  bằng test tự động (`promotion-item-discount.e2e-spec.ts`,
  `promotion-invoice-scope.e2e-spec.ts`, unit test domain), không phải ảnh chụp.
  AC-10 và AC-11 cũng vậy; ảnh POS ở trên chỉ là xác nhận thị giác thêm vào.
