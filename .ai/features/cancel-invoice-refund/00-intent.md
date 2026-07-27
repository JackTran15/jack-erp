---
feature: cancel-invoice-refund
slug: cancel-invoice-refund
owner: Akenzy
created: 2026-07-27
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Hoàn tiền & hoàn kho khi hủy hóa đơn

## Problem

Hủy một hóa đơn POS đã thu tiền hiện **không trả lại tiền cho quỹ**, và **không để lại
chứng từ nào** cho kế toán.

Đọc hết ba consumer của `INVOICE_CANCELLED` xác nhận:

| Chân | Hiện tại | Hậu quả |
|---|---|---|
| Tiền mặt | Không có consumer nào | `cash_accounts.balance` giữ nguyên số tiền đã thu → quỹ tiền mặt phồng lên vĩnh viễn. Phiếu thu POS_SALE vẫn POSTED, sổ quỹ vẫn ghi thu. |
| Tiền gửi | `DepositRefundService` tạo movement WITHDRAWAL thô | Số dư quỹ đúng, nhưng **không có phiếu chi** — kế toán thấy tiền rút khỏi tài khoản mà không có chứng từ đối chiếu. |
| Tồn kho | `StockReturnConsumer` cộng về đúng `invoice_items.location_id` | Hàng bán ra từ kho tổng quay lại kho tổng, không nằm ở showroom nơi nhân viên thực tế nhận lại hàng. |
| Sổ cái | `JournalReverseConsumer` đảo bút toán bán | Đúng, giữ nguyên. |

Người chịu thiệt: kế toán quỹ (số dư sai, không đối chiếu được), và thu ngân
(hàng hoàn về không thấy trong showroom nên không bán lại được).

## Affected personas

| Persona | Current behaviour | Desired behaviour |
|---|---|---|
| Kế toán quỹ | Hủy hóa đơn xong quỹ tiền mặt vẫn dư tiền; phải tự tạo phiếu chi tay và tự nhớ nó ứng với hóa đơn nào | Hệ thống sinh phiếu chi hoàn tiền tự động, ref tới phiếu thu gốc và hóa đơn hủy; số dư quỹ về đúng |
| Kế toán ngân hàng | Thấy movement rút tiền gửi không có chứng từ | Thấy một phiếu chi tiền gửi (UNC) đầy đủ, ref hai chiều |
| Thu ngân / quản lý cửa hàng | Không có nút hủy hóa đơn ở POS; endpoint tồn tại nhưng không màn hình nào gọi | Admin mở danh sách hóa đơn → click hóa đơn → nút "Hủy hóa đơn" |
| Nhân viên kho showroom | Hàng hủy quay về vị trí đã bán ra (có thể là kho tổng) | Hàng luôn cộng vào showroom, bán lại được ngay |

## Success signal

Hủy một hóa đơn tiền mặt 1.000.000₫ trên môi trường thật: số dư quỹ tiền mặt
của chi nhánh giảm đúng 1.000.000₫, sổ quỹ hiện đúng **một** phiếu chi REFUND
liên kết hai chiều với phiếu thu POS_SALE gốc, và tồn kho showroom tăng đúng số
lượng của hóa đơn — kiểm tra được bằng một kịch bản e2e chạy trên DB thật.

## Out of scope

- **Hủy một phần hóa đơn.** Hủy là toàn bộ hóa đơn; hoàn một phần đã có luồng Đổi/Trả hàng.
- **Hủy hóa đơn RETURN / EXCHANGE.** Chỉ hóa đơn `type = SALE` (xem A-05).
- **Hủy hóa đơn công nợ chưa thu đồng nào.** Không có tiền thì không có phiếu chi; phần công nợ vẫn tất toán như hiện tại.
- **Sửa lại các hóa đơn đã hủy trong quá khứ.** Không backfill phiếu chi cho dữ liệu cũ (xem A-07).
- **Màn hình Backoffice.** Nút hủy chỉ đặt ở POS lần này.
- **Thu hồi điểm tích lũy / khuyến mại.** `revertPromotions` đã chạy sẵn trong luồng hủy, không đụng tới.

## Constraints

| Kind | Detail |
|---|---|
| Nghiệp vụ | Chứng từ đã POSTED là bất biến — sửa bằng bút toán đảo, không edit (quy ước repo) |
| Nghiệp vụ | Một quỹ tiền mặt / chi nhánh (`CashFundResolverService.resolveBranchCashFund`) |
| Kỹ thuật | Migration viết tay, `synchronize: false`, `migrationsTransactionMode: 'each'` |
| Kỹ thuật | Consumer phải idempotent: `processed_events` + kiểm tra reference trước khi ghi |
| Kỹ thuật | Source backend chỉ tiếng Anh; tiếng Việt chỉ ở `description` chứng từ và frontend |
| Quyền | Nút hủy ở POS chỉ hiện với role admin; endpoint đang dùng `pos.invoice.write` (xem A-06) |

## Existing surface touched

- **Tái dùng nguyên vẹn:** `CashPaymentsService.createAndPostInternal`,
  `BankPaymentsService.createAndPostInternal`, `CashFundResolverService.resolveBranchCashFund`,
  `resolveBranchItemLocations(..., { showroomOnly: true })`,
  `CashVoucherCategoryResolverService.resolveId`.
- **Mẫu gần nhất để bám theo:** `refund-cash.consumer.ts` (hoàn tiền đổi–trả) — cùng hình
  dạng: movement + phiếu chi trong một transaction, dedupe bằng reference.
- **Sửa:** `cancel-invoice.service.ts`, `invoice-cancelled.publisher.ts` (payload phải mang
  dữ liệu thanh toán), `deposit-refund.service.ts` (nhường quyền ghi movement cho phiếu chi),
  `stock-return.consumer.ts` (đổi sang showroom).
- **Mới:** một consumer hoàn tiền khi hủy hóa đơn, một migration thêm cột liên kết chéo
  phiếu thu ↔ phiếu chi, một dialog xác nhận hủy ở POS.
- **Adjacent:** luồng Đổi/Trả hàng dùng chung `cash_payments` và cùng quỹ — không được
  ghi đè lẫn nhau.
