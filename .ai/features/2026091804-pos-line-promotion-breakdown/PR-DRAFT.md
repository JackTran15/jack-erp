# feat(pos): CTKM tự áp dụng hiện trên từng dòng hàng — màn hình bán, hóa đơn in, hóa đơn đã lưu

## Vì sao

Sau `2026091803` engine chia đúng (CTKM hàng hóa lấy dòng, CTKM hóa đơn chỉ
chạm phần còn lại), nhưng thu ngân không nhìn thấy điều đó ở đâu: dòng hàng vẫn
in giá gốc, panel gom mọi CTKM thành một dòng *Khuyến mại*, hóa đơn in chỉ tách
được ở phần tổng, và hóa đơn đã lưu không có tên CTKM để in lại. Akenzy chốt:
**CTKM hiển thị y hệt giảm giá tay** — nhãn đỏ dưới tên hàng + gạch giá gốc /
giá sau — và dòng *Khuyến mại* ở panel **chỉ** là khuyến mãi trên hóa đơn.

## Làm gì

| Tầng | Thay đổi |
| --- | --- |
| `pos-web/lib/.../linePromotionIndex.ts` (mới) | `buildLinePromotionIndex(appliedPrograms)` — một hàm thuần chia CTKM theo dòng và theo nhóm **item** (ITEM_DISCOUNT / TIERED / BUY_M_GET_N) vs **invoice**; dùng chung cho preview (lineId client) và snapshot (`invoice_items.id`). Chỗ duy nhất giữ danh sách loại |
| `checkout-session.store.ts` | `selectLinePromotionIndex`, `selectPromotionBucketTotals` — memo theo `(preview.data, purchaseCart)` |
| `InvoiceLineItemRow.tsx` | Nhãn "Tên CTKM (số giảm)" sau nhãn giảm tay; *Thành tiền* = sau giảm tay + CTKM hàng hóa (gạch giá gốc). CTKM hóa đơn phân bổ xuống dòng: **chỉ nhãn**, không gạch |
| `PaymentSummaryBlock.tsx`, `promotionPresentation.ts` | *Tổng tiền* = Σ Thành tiền đang hiện; dòng *Khuyến mại* chỉ CTKM hóa đơn, ẩn khi không có; ✕ chỉ loại CTKM hóa đơn |
| `checkoutReceiptFactory.ts`, `renderInvoiceHtml.ts`, `invoice-printing.interface.ts` | Dòng in thêm `promotionLabels[]`, `lineTotal` sau CTKM hàng hóa; **khối tổng in không đổi** |
| API `draft-invoice.response.dto.ts`, `invoice.service.ts` | `appliedPromotions[]` thêm `programId, code, name, priority, lineDiscounts[{lineId, discountAmount, unitPriceAfter}]` từ snapshot — additive |
| `packages/api-client` | regen, chỉ thêm |
| `InvoiceReceiptDialog.tsx`, `invoiceRowPrintPayload.ts` | Chi tiết hóa đơn + in lại vẽ từ snapshot, không gọi engine |

**Không đổi engine, không đổi saga, không migration.** `lineTotal()` và
`selectGrandTotal` giữ nguyên → payload checkout và *Còn phải thu* không đổi từng
đồng; chỉ số hiển thị đổi (ADR-03).

## Số học

Giỏ SKU-685 (685.000) + SKU-100 (100.000); CTKM-A hàng hóa 10% trên SKU-685;
CTKM-B hóa đơn 10% `NON_PROMO_ONLY`:

```
SKU-685  ~~685.000~~ 616.500   CTKM-A hang hoa 10% … (68.500)
SKU-100    100.000             CTKM-B hoa don 10% … (10.000)      ← nhãn thôi

Tổng tiền          716.500   (trước: 785.000)
Khuyến mại (10%)   -10.000   (trước: -78.500; ẩn khi không có CTKM hóa đơn)
Còn phải thu       706.500   (không đổi)
```

Giảm tay 50.000 trên SKU-685: engine vẫn lấy 10% **đơn giá gốc** (68.500, không
phải 63.500 — plan ban đầu ghi sai, đã sửa A-09); Thành tiền 566.500, Còn phải
thu 656.500 = `amountAfterPromotion`.

## Hành vi đổi cần biết khi review

1. **✕ cạnh "Khuyến mại" giờ chỉ bỏ CTKM hóa đơn** (trước: bỏ hết — T-09-04).
   CTKM hàng hóa bỏ trong modal *Chương trình khuyến mãi* như UOW-09 đã cho phép.
   Hộp xác nhận nêu đích danh chương trình bị bỏ (A-04 / ADR-05).
2. **"Tổng tiền" đổi nghĩa**: từ "sau giảm tay" thành "sau giảm tay + CTKM hàng
   hóa" — để Σ Thành tiền = Tổng tiền và Tổng tiền − Khuyến mại = Còn phải thu.
3. Khối tổng hóa đơn in và khối tổng dialog chi tiết **không đổi** (A-05) — chỉ
   dòng hàng thêm nhãn/giá sau.

## Kiểm chứng

- **Headless POS có assert DOM** (`capture-pos-evidence.py`, ảnh trong
  `evidence/`): `--lines` AC-01/02/04/06/07/08/09/10; `--receipt` AC-11/13;
  `--checkout` AC-12 (hóa đơn `2609180004`); `--posted 2609180004` AC-15/16
  (0 lời gọi `evaluate` khi mở dialog); `--posted-plain 2609180005` hóa đơn
  không snapshot vẽ như cũ.
- **e2e API** promotion + checkout: 7 suite / 48 case xanh, gồm
  `invoice-applied-promotions.e2e-spec.ts` (mới, 2/2). `checkout-saga-promotion`
  AC-10 case 2 nới `toEqual` shape cũ → `toMatchObject` (có chủ ý).
- **Unit API** 408 suite, 5647 passed, 0 failed; `invoice.service.spec.ts` sửa
  có chủ ý theo shape mới.
- **Đỏ sẵn trên `main`, không phải của PR này**: `promotion-evaluate` AC-03;
  `invoice-order-listing` / `invoice-item-revenue-detail` /
  `invoice-report-template-columns` (403/500 — quyền báo cáo không được seed).
  Đã chứng minh bằng cách chạy với hai file API của PR quay về `87d4f252`.
- `tsc --noEmit` pos-web xanh; api-client diff chỉ thêm.

## Nợ kỹ thuật phát hiện (không sửa trong PR này)

- `promotionPresentation.test.ts` và `checkoutReceiptFactory.test.ts` không
  chạy (`"test": "echo test"`); hai case `shouldShowPromotionRow` trong đó giờ
  mô tả hành vi cũ (gộp mọi loại). Sửa khi có runner.
- Khối tổng dialog chi tiết hóa đơn hiện *Thành tiền 706.500 / Tổng thanh toán
  706.500 / Giảm giá 78.500* — ba số đọc chưa tự nhiên, có từ trước.
- `apps/api/.env` khai `DB_NAME` hai lần; ConfigModule lấy dòng cuối
  (`erp_clone_prod`, không tồn tại) khi chạy từ source — tiến trình dev đang
  sống nhờ biến môi trường/`.env` gốc. Nên gỡ dòng thừa.
