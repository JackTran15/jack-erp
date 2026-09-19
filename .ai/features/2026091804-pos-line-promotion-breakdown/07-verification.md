---
feature: pos-line-promotion-breakdown
environments: [local-pos]
viewports: [desktop]
run_by: Claude (phiên 2026-09-18), headless qua `capture-pos-evidence.py`
database: erp_dev_3008 (DB mà API trên :4000 đang bind — kiểm bằng SELECT fixture, xem memory `api-db-binding-check`)
---

# Kiểm chứng trên trình duyệt — CTKM tự áp dụng hiện trên từng dòng hàng

## Cách chạy

```
~/.venvs/aidlc-verify/bin/python .ai/features/2026091804-pos-line-promotion-breakdown/capture-pos-evidence.py --lines
```

Headless Chromium, đăng nhập POS bằng `LOCAL_BACKOFFICE_*` trong
`.ai/credentials.env`, ghim chi nhánh Hồ Chí Minh, gõ SKU vào ô tìm kiếm. **Mọi
số đều đọc từ DOM và assert** — ảnh sai số thì script exit 1. Không qua
`aidlc-verify` vì recipe `form` không điền được form POS 3 ô (đã ghi ở
`.ai/aidlc.yaml`).

| Thứ | Giá trị |
| --- | --- |
| POS | http://localhost:3001 (Vite dev, `apps/pos-web/.env` có `VITE_CHECKOUT_V2=true`) |
| API | http://localhost:4000 → **`erp_dev_3008`** |
| Fixture | `SKU-685` 685.000, `SKU-100` 100.000, `KM000003` CTKM-A hàng hóa 10% trên SKU-685, `KM000004` CTKM-B hóa đơn 10% `NON_PROMO_ONLY` (dựng ở feature 2026091803) |
| Khung nhìn | desktop 1440×900 |

## Số học engine mà kỳ vọng dựa vào

Đối chiếu `POST /v2/promotions/evaluate` trước khi ghi cứng số (T-01-02):

| Giỏ | subtotal | CTKM-A | CTKM-B | amountAfterPromotion |
| --- | ---: | ---: | ---: | ---: |
| SKU-685 | 685.000 | 68.500 | bỏ qua `CONDITION_NOT_MET` | 616.500 |
| SKU-685 + SKU-100 | 785.000 | 68.500 | 10.000 (chỉ SKU-100) | 706.500 |
| … + giảm tay 50.000 trên SKU-685 | 735.000 | **68.500** (10% đơn giá gốc, không phải 63.500) | 10.000 | 656.500 |

Dòng cuối là chỗ plan ban đầu sai (A-09): engine lấy % trên đơn giá gốc kể cả
khi có giảm tay. UI không tự tính %, chỉ trừ đúng `discountAmount` engine trả —
nên mọi số dưới đây khớp server từng đồng.

---

## UOW-01 — Màn hình bán hàng

Log `--lines` 2026-09-18:

```
  row {'labels': ['CTKM-A hang hoa 10% SKU-685 - claude (68.500)'], 'struck': '685.000', 'net': '616.500'} panel {'tong': '616.500', 'km': None, 'due': '616.500'}
  ok  AC-01 label+strike
  ok  AC-07 no Khuyến mại row
  row {'labels': ['CTKM-B hoa don 10% NON_PROMO_ONLY - claude (10.000)'], 'struck': None, 'net': '100.000'} panel {'tong': '716.500', 'km': '-10.000', 'due': '706.500'}
  ok  AC-02 invoice label, no strike
  ok  AC-08 panel
  ok  AC-08 label (10%)
  row {'labels': ['KM 50.000 - test', 'CTKM-A hang hoa 10% SKU-685 - claude (68.500)'], 'struck': '685.000', 'net': '566.500'} panel {'tong': '666.500', 'km': '-10.000', 'due': '656.500'}
  ok  AC-04 stacked labels
  ok  AC-09 Σ Thành tiền = Tổng tiền
  confirm: Bỏ áp dụng chương trình "CTKM-B hoa don 10% NON_PROMO_ONLY - claude"? Còn phải thu sẽ đổi từ 656.500 thành 666.500.
  ok  AC-10 confirm names only CTKM-B
  row {... 'net': '566.500'} panel {'tong': '666.500', 'km': None, 'due': '666.500'}
  ok  AC-10 after: row keeps CTKM-A, no Khuyến mại row
  row {'labels': ['KM 50.000 - test'], 'struck': '685.000', 'net': '635.000'} panel {'tong': '735.000', 'km': None, 'due': '735.000'}
  ok  AC-06 CTKM-A gone, manual stays
RESULT: PASS
```

### AC-01 + AC-07 — giỏ `SKU-685` ✅

Dòng: nhãn đỏ *CTKM-A hang hoa 10% SKU-685 - claude (68.500)*, Thành tiền
~~685.000~~ **616.500**. Panel: Tổng tiền **616.500**, **không** có dòng Khuyến
mại (CTKM-B bị bỏ qua), Còn phải thu 616.500.

![L-01](evidence/L-01-sku685-ac01-ac07.png)

### AC-02 + AC-08 — giỏ `SKU-685` + `SKU-100` ✅

Dòng 2: nhãn *CTKM-B … (10.000)*, Thành tiền **100.000 không gạch** (A-01).
Panel: Tổng tiền **716.500** (= 616.500 + 100.000), *Khuyến mại (10%)* **−10.000**,
Còn phải thu **706.500** — không đổi so với trước feature.

![L-02](evidence/L-02-sku685-sku100-ac02-ac08.png)

### AC-04 + AC-09 — giảm tay 50.000 trên `SKU-685` ✅

Hai nhãn dưới tên, đúng thứ tự: *KM 50.000 - test* rồi *CTKM-A … (68.500)*;
Thành tiền ~~685.000~~ **566.500**. Tổng tiền **666.500** = 566.500 + 100.000;
Còn phải thu **656.500** = `amountAfterPromotion`.

![L-03](evidence/L-03-giam-tay-ac04-ac09.png)

### AC-10 — ✕ cạnh *Khuyến mại* chỉ bỏ CTKM hóa đơn ✅

Hộp xác nhận chỉ nêu CTKM-B, kèm số trước/sau (656.500 → 666.500). Sau khi bỏ:
dòng Khuyến mại biến mất, nhãn CTKM-A trên SKU-685 **vẫn còn**, Còn phải thu =
Tổng tiền 666.500.

![L-04](evidence/L-04-x-khuyen-mai-confirm-ac10.png)
![L-05](evidence/L-05-sau-x-ac10.png)

### AC-06 — bỏ CTKM-A trong modal ✅

Nhãn CTKM-A và phần gạch của nó biến mất; nhãn giảm tay còn (635.000); Tổng
tiền 735.000. CTKM-B không quay lại SKU-685 vì dòng có giảm tay (A-02 của
feature 2026091803).

![L-06](evidence/L-06-bo-ctkm-a-ac06.png)

### AC-03, AC-05 — đọc mã

- AC-03: `InvoiceLineItemRow` chỉ vẽ nhãn/gạch khi `hasManualDiscount || promotionItemDiscount > 0`; index rỗng khi preview không `ready` → dòng y hệt trước.
- AC-05: ảnh L-01 — giỏ chỉ SKU-685, không có nhãn CTKM-B trên dòng và không có dòng Khuyến mại.

---

## UOW-02 — Hóa đơn in lúc bán

```
capture-pos-evidence.py --receipt     # In tạm tính, 2 kịch bản
capture-pos-evidence.py --checkout    # Thu tiền với "In hóa đơn" bật — TẠO hóa đơn thật
```

HTML in được lấy từ iframe của `BrowserWindowInvoicePrinter` (headless stub
`window.print`, rồi tự gọi `onafterprint` để nhả trạng thái "đang in"), mở lại
ở 480px và đọc từng `tr`/`div.row`.

### AC-11 — In tạm tính, giỏ SKU-685 + SKU-100 ✅

```
{'name': 'Giày nữ 685 - claude', 'subs': ['CTKM-A hang hoa 10% SKU-685 - claude (68.500)'], 'price': '685.000', 'total': '616.500'}
{'name': 'Phụ kiện 100 - claude', 'subs': ['CTKM-B hoa don 10% NON_PROMO_ONLY - claude (10.000)'], 'price': '100.000', 'total': '100.000'}
Tiền hàng 785.000 · Khuyến mãi 78.500 · KM theo mặt hàng 68.500 · KM theo hóa đơn 10.000 · Tổng thanh toán: 706.500
```

Khối tổng **y hệt** ảnh `POS-05` của feature 2026091803 (A-05); chỉ dòng hàng
thêm nhãn và TT sau CTKM hàng hóa.

![R-01](evidence/R-01-tam-tinh-ac11.png)

### AC-13 — giảm tay 50.000 + CTKM-A trên cùng dòng in ✅

```
{'name': 'Giày nữ 685 - claude', 'subs': ['KM 50.000 - test', 'CTKM-A hang hoa 10% SKU-685 - claude (68.500)'], 'price': '685.000', 'total': '566.500'}
Tiền hàng 785.000 · Giảm giá 50.000 · Khuyến mãi 78.500 · KM theo mặt hàng 68.500 · KM theo hóa đơn 10.000 · Tổng thanh toán: 656.500
```

![R-02](evidence/R-02-giam-tay-ac13.png)

### AC-12 — hóa đơn in sau Thu tiền ✅

`--checkout` với *In hóa đơn* bật → hóa đơn **`2609180004`** (`paid`,
`discount_amount` 78.500, `amount_due` 706.500). HTML in giống tạm tính từng
nhãn, từng số (cùng `renderInvoiceHtml`, cùng payload từ
`buildCheckoutInvoicePayload`).

![R-03](evidence/R-03-sau-thu-tien-ac12.png)

Hóa đơn `2609180004` (và `2609180003` từ feature trước) là dữ liệu cho UOW-03.

---

## UOW-03 — Hóa đơn đã lưu

```
capture-pos-evidence.py --posted 2609180004        # dialog + in lại, có snapshot
capture-pos-evidence.py --checkout-noprom          # tạo hóa đơn KHÔNG snapshot (✕ CTKM-B rồi Thu tiền)
capture-pos-evidence.py --posted-plain 2609180005  # dialog + in lại, không snapshot
```

### AC-14 — API trả snapshot đủ để vẽ từng dòng ✅ [DB]

`apps/api/test/e2e/invoice-applied-promotions.e2e-spec.ts` trên `erp_test`
(checkout thật qua `/v2/pos/checkout` rồi `GET /invoices/:id`): 2/2 ✓ — mỗi
phần tử có `programId, code, name, type, priority, discountAmount,
lineDiscounts[]`; `lineId` trùng `items[].id`; CTKM-B chỉ có dòng cho SKU-100;
hóa đơn không CTKM → `[]`. Swagger `/docs-json` có `AppliedInvoicePromotionLineDto`.

### AC-15 — Dialog chi tiết hóa đơn `2609180004` ✅

```
{'name': 'Giày nữ 685 - claude', 'labels': ['CTKM-A hang hoa 10% SKU-685 - claude (68.500)'], 'struck': '685.000', 'total': '616.500'}
{'name': 'Phụ kiện 100 - claude', 'labels': ['CTKM-B hoa don 10% NON_PROMO_ONLY - claude (10.000)'], 'struck': None, 'total': '100.000'}
```

Khối tổng của dialog (*Thành tiền 706.500 / Tổng thanh toán 706.500 / Giảm giá
78.500*) giữ nguyên như trước feature.

![P-01](evidence/P-01-dialog-2609180004-ac15.png)

### AC-16 — In lại từ dialog ✅

HTML in từng dòng giống hóa đơn lúc bán (R-01), khối tổng 785.000 / 78.500 /
68.500 / 10.000 / 706.500. `page.on("request")` ghi **0** lời gọi
`/v2/promotions/evaluate` từ lúc mở dialog tới lúc in — dữ liệu là snapshot.

![P-02](evidence/P-02-in-lai-2609180004-ac16.png)

### Hóa đơn không snapshot `2609180005` — như hôm nay ✅

Tạo bằng `--checkout-noprom` (giỏ SKU-100, thu ngân ✕ CTKM-B, Thu tiền →
`invoice_checkout_promotions` 0 dòng). Dialog: không nhãn, không gạch, 100.000.
In lại: không `line-sub`, không dòng *Khuyến mãi*, Tổng thanh toán 100.000.

![P-03](evidence/P-03-dialog-2609180005-khong-ctkm.png)

### AC-17 — Hồi quy ✅

| Bộ | Kết quả |
| --- | --- |
| `apps/api` unit (toàn bộ) | 408 suite, **5647 passed, 1 skipped, 0 failed** |
| `apps/api` e2e promotion/checkout (`promotion-crud`, `promotion-evaluate-pos`, `promotion-invoice-scope`, `promotion-invoice-scope-checkout`, `promotion-item-discount`, `checkout-saga-promotion`, `invoice-applied-promotions`) | **7/7 suite, 48/48 case** sau khi nới `checkout-saga-promotion` AC-10 case 2 (`toEqual` shape cũ → `toMatchObject`, khai ở T-03-04) |
| e2e đỏ **có sẵn trên `main`** (không phải hồi quy) | `promotion-evaluate` AC-03 (đã ghi ở feature 2026091803); `invoice-order-listing`, `invoice-item-revenue-detail`, `invoice-report-template-columns` — toàn bộ case 403/500 (quyền báo cáo không được seed). Chứng minh: checkout hai file API của feature này về bản `87d4f252` → cùng 403/500 |
| `pnpm openapi:generate` | chỉ thêm: `AppliedInvoicePromotionLineDto`, 5 field trên `AppliedInvoicePromotionDto` (+2 field `MobileRevenueCategory*` của #281 chưa regen); 0 schema/path bị xóa |
| `apps/pos-web` `tsc --noEmit` | xanh sau mỗi ticket |
| `git diff --stat` đối chiếu `touches:` | 10 commit, mỗi commit đúng file khai; `invoice.service.spec.ts` khai thêm vào T-03-01 |

---

## Dữ liệu để lại

- `--lines`/`--receipt` không tạo gì: chỉ thao tác trên giỏ chưa thu tiền.
- `--checkout` tạo hóa đơn `2609180004` (`paid`, 706.500, bán vượt tồn) và
  `--checkout-noprom` tạo `2609180005` (`paid`, 100.000, không CTKM) trên
  `erp_dev_3008`.
- Fixture `SKU-685`/`SKU-100`/`KM000003`/`KM000004` (`- claude`) giữ nguyên từ
  feature 2026091803.

## Chưa kiểm chứng ở đây

- Không còn — 17/17 AC có bằng chứng ở trên (AC-03/AC-05 bằng đọc mã, còn lại
  bằng DOM/HTML/e2e).
