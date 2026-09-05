---
feature: pos-draft-invoice-fixes
blocking_open: 0
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | Ảnh chụp lỗi 1 đến từ bản deploy `jack-erp-pos.ducanhzed.com`, có thể cũ hơn `main`. Đọc code `main` thì effect tự điền (`PaymentSection.tsx:59`) *phải* chạy khi mở tab nháp, nên chưa giải thích được số 0 trên ảnh | low | no | Không — thiết kế đã chọn phủ cả hai nhánh: đường khôi phục gán số tiền ngay lúc dựng session (che ca effect không chạy) **và** khoá không cho auto-fill ghi đè (che ca effect có chạy). Sai về nguyên nhân không đổi phạm vi UoW | resolved | Tái hiện trên local :3001 (4/9/2026): lưu tạm rồi mở lại một phiếu 160.000 → "Tiền mặt" ra ĐÚNG 160.000, effect tự điền CHẠY BÌNH THƯỜNG trên `main`. Vậy lỗi trên ảnh KHÔNG tái hiện được cho ca số tiền = tổng phải thu; nó chỉ còn hai lời giải thích: (a) bản deploy staging cũ hơn `main`, (b) thu ngân đã gõ tay một số KHÁC tổng (vd khách đưa dư) và số đó không được lưu — đúng ca mà UOW-01 nhận sửa. T-01-05 vẫn cần thiết vì auto-fill sẽ ghi đè số khôi phục khác tổng |
| A-02 | Backend không giữ chỗ tồn kho cho hoá đơn nháp | high | yes | Nếu sai, lỗi 2 là lỗi backend chứ không phải FE và UOW-02 phải viết lại | confirmed | Đã đọc `InvoiceService.create()` (`invoice.service.ts:85-170`): chỉ ghi `invoices` + `invoice_items`, không có `StockLedgerService`/`stock_balances`. `checkout-saga` mới là nơi trừ kho |
| A-03 | `POST /v2/invoices/search` chỉ có một nơi tiêu thụ: `useInvoiceList` của pos-web | high | yes | Lọc nháp ở server sẽ làm hụt dữ liệu của màn khác | confirmed | grep toàn repo (`apps/`, `packages/`, trừ generated): chỉ `invoice.service.ts:30` của pos-web gọi. Backoffice và các báo cáo dùng endpoint khác |
| A-04 | Không có màn nào cần xem hoá đơn nháp trên "DS hoá đơn" | medium | yes | Ẩn cứng ở server sẽ chặn một nhu cầu thật | confirmed | Akenzy chọn "Lọc ở server", 2026-09-04. `STATUS_OPTIONS` của bảng vốn đã không có "Nháp" — nháp có dialog "HĐ lưu tạm" riêng |
| A-05 | Dòng thanh toán của phiếu nháp phải lưu ở chỗ khác `invoice_payments` | medium | yes | Nếu tái dùng bảng đó, `account_id` NOT NULL buộc phải giải COA lúc lưu nháp, và số liệu nháp chảy vào kế toán | confirmed | `invoice-payment.entity.ts`: `account_id` uuid NOT NULL, bảng này là chân tiền của journal entries. Nháp chưa giải được COA. ADR-02 chốt cột jsonb trên `invoices` |
| A-06 | Dòng hàng khôi phục từ nháp bị kẹt `onHandUnknown` vì `useSyncCartOnHand` chỉ chạy lại khi *reference* `catalogQuery.data` đổi, mà khôi phục nháp không làm catalog refetch | medium | yes | Nếu sai, sửa chỗ đồng bộ không hết lỗi và UOW-02 phải đổi hướng | confirmed | `use-sync-cart-on-hand.ts:21-23` dep là `[data, syncPurchaseCartOnHand]`; `useCatalogQuery` có `staleTime: 30_000`. `openDraftInNewSession` chỉ `set()` vào session store, không đụng React Query |
| A-07 | Phiếu nháp lưu trước thay đổi này (không có dòng thanh toán) vẫn phải mở lại được | high | no | Thu ngân gặp tab trắng tiền hoặc crash trên dữ liệu cũ | confirmed | Quy ước sẵn có: `ensureDraftShape` và `DraftInvoice.payments?` đều optional để snapshot cũ còn load được |
| A-08 | Cảnh báo vượt tồn vẫn phải bật cho mặt hàng thật sự không có bản ghi tồn ở chi nhánh | high | no | Mất cảnh báo bán khống thật | confirmed | Akenzy chọn "Vẫn cảnh báo", 2026-09-04. Khớp chú thích thiết kế sẵn có tại `checkout-session.store.ts:356-363` |
| A-09 | Ngưỡng cảnh báo giữ nguyên `sellableQuantity` (showroom + kho tạm), không đổi sang `quantityOnHand` | high | no | Ngưỡng lệch với dialog chọn biến thể → hai màn báo khác nhau | confirmed | `readSellableOnHand` là cơ sở chung hiện tại (`checkout-session.store.ts:365-377`); ngoài phạm vi khiếu nại |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
| --- | --- | --- | --- |
| A-10 | Hoá đơn nháp chiếm/giữ chỗ tồn kho như thu ngân mô tả ("bị chiếm số lượng mặc dù chưa bán") | Nháp không ghi sổ kho gì cả; con số tồn không đổi. Thứ thu ngân thấy là cảnh báo *chưa-biết-tồn* của FE, hiển thị y như cảnh báo vượt tồn | Bỏ hẳn hướng "nhả chỗ tồn khi lưu nháp" khỏi phạm vi; UOW-02 chỉ còn là sửa đồng bộ tồn ở FE |
