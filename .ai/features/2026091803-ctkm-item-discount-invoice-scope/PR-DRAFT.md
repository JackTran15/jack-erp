# feat(promotion): mở lại "Giảm giá hàng hóa" và khôi phục phạm vi giảm giá hóa đơn

## Vì sao

Hai việc, chung một màn hình, và việc thứ hai chỉ lộ ra khi việc thứ nhất được mở lại.

**1. Không tạo được CTKM "Giảm giá hàng hóa".** Từ 2026-08-11 `ADD_NEW_TYPE_OPTIONS`
lọc menu *Thêm mới* xuống còn *Giảm giá hóa đơn*. Engine, bảng DB và variant form
đều đã có sẵn — chỉ mất lối vào.

**2. Giảm giá hóa đơn cộng dồn lên hàng đã được khuyến mại.**
`docs/26-promotion-design.md` **BR-002** chốt *"Dòng trước, hóa đơn sau trên phần
còn lại (NON_PROMO_ONLY)"*, và engine làm đúng. Nhưng đường ghi không đặt được giá
trị đó: `ApplyScopePromotionSection` là nhãn chết và `invoiceDiscountToDto`
hardcode `ALL_ITEMS`.

> ⚠️ **PR này đảo một quyết định đã ship.** `promotion-scope-points-toggle` ADR-01
> (2026-08-17, accepted) cố ý gỡ radio và ép `ALL_ITEMS`. ADR-01 của feature
> `2026091803-ctkm-item-discount-invoice-scope` ghi rõ nó **supersede** quyết định
> đó, sau khi Akenzy được trình bày mâu thuẫn và xác nhận ngày 2026-09-18.
> Phần B của feature tháng 8 (checkbox `accruePoints`) **không** bị đụng.

## Làm gì

| Tầng | Thay đổi |
| --- | --- |
| `programs.constants.ts` | `ADD_NEW_ENABLED_FORMS` thay cho `.filter(... === INVOICE_DISCOUNT)` — mở thêm `PRODUCT_DISCOUNT`, ba hình thức còn lại vẫn ẩn có chủ ý |
| `ApplyScopePromotionSection.tsx` | Nhãn chết → `RadioGroup` thật, kèm cảnh báo khi đang ở `ALL_ITEMS` |
| `program-form.constants.ts` | `emptyForm.applyScope`: `ALL_ITEMS` → `NON_PROMO_ONLY` (mặc định nằm ở đây, không ở mapper — ADR-03) |
| `promotion.mapper.ts` | Bỏ hardcode, dùng `applyScopeToApi(form.applyScope)` |
| `cart-state.ts` | **Thêm** `discountFreeLines()`; `unclaimedLines()` giữ nguyên để `condition-evaluator` không đổi nghĩa (ADR-02) |
| `invoice-discount.strategy.ts` | Nhánh `NON_PROMO_ONLY` dùng `discountFreeLines` — loại cả dòng **giảm giá tay** của thu ngân |
| `.env.example` | **Ngoài đồ thị ticket, thêm sau G5.** Ghi mẫu `VITE_CHECKOUT_V2=true` cho `apps/pos-web/.env` — production đã chạy cờ này; máy dev thiếu file thì POS rơi về v1 và không thu được CTKM (xem "Nợ kỹ thuật") |

**Không migration.** Cột `invoice_scope` đã có; CTKM cũ giữ nguyên giá trị *và*
cách tính (ADR-04: `NULL`/`undefined` vẫn là toàn hóa đơn).

## Số học

Giỏ 685.000 + 100.000 = **785.000**, CTKM hàng hóa 10% trên dòng 685.000, CTKM hóa
đơn 10%:

| | Giảm hàng hóa | Giảm hóa đơn | Tổng giảm | Phải trả |
| --- | ---: | ---: | ---: | ---: |
| Trước (ALL_ITEMS) | 68.500 | 78.500 | 147.000 | 638.000 |
| **Sau (NON_PROMO_ONLY)** | 68.500 | **10.000** | **78.500** | **706.500** |

## Kiểm chứng

- **Unit** 324/324 xanh (32 suite), gồm `modules/mobile` và checkout-saga. Baseline trước PR: 314 — không test cũ nào bị xoá hay đỏ.
- **e2e trên DB thật**: `promotion-item-discount` 7/7, `promotion-invoice-scope` 4/4, `promotion-invoice-scope-checkout` 2/2.
- **Checkout thật** ghi xuống `invoices`: `subtotal` 785.000, `discount_amount` **78.500**, `amount_due` **706.500**.
- **Trình duyệt (backoffice)**: AC-01, AC-02, AC-22, AC-23, AC-15, AC-17 — ảnh trong `.ai/features/2026091803-ctkm-item-discount-invoice-scope/evidence/`.
- **Trình duyệt (POS, headless)**: giỏ `SKU-685` → **616.500**; giỏ `SKU-685` + `SKU-100` → **706.500** trên màn hình thu ngân, số assert từ DOM bởi `capture-pos-evidence.py` — `evidence/POS-01-*.png`, `POS-02-*.png`; modal *Chương trình khuyến mãi* liệt kê cả hai *Đã áp dụng* (`POS-03`).
- **Hóa đơn in (POS `--receipt`)**: *KM theo mặt hàng* 68.500 / *KM theo hóa đơn* 10.000 / *Tổng thanh toán* 706.500 — `evidence/POS-05-in-tam-tinh.png`. Từng dòng: `invoice_checkout_promotions.line_discounts` của `2609180003` — SKU-685 685.000 → 616.500 (KM000003), SKU-100 100.000 → 90.000 (KM000004), không dòng nào của KM000004 chạm SKU-685.
- **Thu tiền thật từ POS** (`--checkout`, `VITE_CHECKOUT_V2=true`): hóa đơn `2609180001` (vite `:3002`) và `2609180003` (`:3001` sau khi có `apps/pos-web/.env`) — `paid`, `discount_amount` 78.500, `amount_due` 706.500, hai dòng `invoice_checkout_promotions` (68.500 + 10.000, dòng SKU-100 only).
- **Hồi quy có chủ ý**: `promotion.mapper.spec.ts` đổi kỳ vọng từ `ALL_ITEMS` sang giá trị của form. Lưu ý `apps/backoffice-web` khai `"test": "echo test"` nên file này **chưa từng chạy** — không tính là bằng chứng.

## Đáng chú ý khi review

1. `unclaimedLines()` **không** đổi — `condition-evaluator` dùng chung cho `calc_basis = NON_PROMO_ITEMS`. Đó là lý do có hàm thứ hai thay vì sửa hàm cũ.
2. CTKM cũ `ALL_ITEMS` vẫn giảm chồng, **có chủ ý** (A-03, test AC-16). Không backfill; thay vào đó form cảnh báo.
3. Không frontend nào trong repo có test runner — xem mục "Nợ kỹ thuật" bên dưới.

## Nợ kỹ thuật phát hiện trong lúc làm (không sửa trong PR này)

- `apps/backoffice-web` và `apps/pos-web` đều khai `"test": "echo test"` → mọi `*.spec.ts`/`*.test.ts` phía web chưa từng chạy.
- `apps/api/.env` khai `DB_NAME` **hai lần** (dòng 8 `erp_dev`, dòng 45 `erp_clone_prod`). dotenv lấy dòng đầu, shell lấy dòng cuối, `.env` gốc repo khai `erp_dev_3008`. Cùng một ngày, API buổi sáng ghi vào `erp_dev`, tiến trình khởi động lại 14:36 ghi vào `erp_dev_3008` — bằng chứng backoffice và POS của PR này vì thế nằm trên hai DB.
- `.ai/aidlc.yaml` có hai env `required` (`local-backoffice-bm`, `local-backoffice-wh`) thiếu credentials → `aidlc-verify` trả `rung: skipped` cho **mọi** feature.
- **POS chạy luồng checkout v1 khi `VITE_CHECKOUT_V2` không đặt — và v1 không áp CTKM**: màn hình bảo thu 706.500, `POST /invoices/:id/checkout` tính từ `invoice.discountAmount` của draft (= 0) nên đòi 785.000 và trả 400 *"must have a customer when there is a remaining debt balance"*. Chỉ `/v2/pos/checkout` ghi đúng. Production đã bật cờ; PR này chỉ ghi mẫu vào `.env.example`. Gỡ hẳn nhánh v1 + endpoint `/invoices/:id/checkout` (để không còn cấu hình nào tắt được CTKM) là việc riêng.
- Màn hình thu ngân POS không cho thấy CTKM nào đang giảm bao nhiêu: một dòng *Khuyến mại* gộp, dòng hàng không hiện giá sau CTKM (`InvoiceLineItemRow` chỉ vẽ giảm tay), modal *Chương trình khuyến mãi* có tên nhưng không có số tiền. Chỉ hóa đơn **in** mới tách *KM theo mặt hàng* / *KM theo hóa đơn*. Dữ liệu từng dòng đã có trong `appliedPrograms[].lineDiscounts` của preview — vẽ lên dòng hàng là feature UI riêng.

## Đính chính 2026-09-21

Việc để sau *"Gỡ hẳn nhánh v1 + endpoint `/invoices/:id/checkout`"*: **mobile không còn phụ thuộc v1** kể từ
feature `2026092101-erp-sales-promotion-points-v2` (mobile repo) — `MobileCashierService.checkout` gọi `CheckoutSagaRunner`. Người gọi v1 duy nhất
còn lại là fallback của web POS khi `VITE_CHECKOUT_V2` tắt (`InvoiceController` L74/L172).
