---
feature: Phiếu thu chi — đối tượng tự nhập, địa chỉ, In và Xuất khẩu
slug: 2026090804-treasury-voucher-party-address-print-export
owner: Akenzy
created: 2026-09-08
status: draft
---

# Intent — Phiếu thu chi: đối tượng tự nhập, địa chỉ, In và Xuất khẩu

## Problem

Người dùng báo ba việc trên màn Quỹ tiền → Phiếu thu / Phiếu chi (2026-09-08):

1. **"Nhập tên đối tượng chưa work."** Không gõ được tên đối tượng vào phiếu. Chỉ chọn
   được từ danh mục khách hàng / nhà cung cấp / nhân viên; đối tượng vãng lai không có
   trong danh mục thì đành bỏ trống ô Đối tượng.
2. **"Địa chỉ không lưu database."** Gõ địa chỉ trên phiếu tiền mặt, lưu xong mở lại thì
   mất. (Phiếu tiền gửi thì giữ được — chính sự khác nhau này làm người dùng tưởng hỏng
   ngẫu nhiên.)
3. **"Chưa có In hay xuất khẩu."** Không in được phiếu ra giấy, không tải được file Excel
   của phiếu, và danh sách Thu chi cũng không xuất được.

Ý #1 và #2 chặn nghiệp vụ thật: phiếu chi tiền lẻ cho người vãng lai (thợ sửa chữa, xe ôm,
khách lẻ trả hàng) không ghi được tên và địa chỉ người nhận tiền, nên phiếu in ra — nếu in
được — sẽ thiếu chỗ ký nhận. Ý #3 làm cả quy trình kế toán quỹ vẫn phải làm tay ngoài
phần mềm.

### Điều tra: hai trong ba báo cáo có nguyên nhân khác với vẻ ngoài

**#1 không phải "chưa làm". Đã làm gần hết, nhưng không có đường vào.**
Feature `2026090701-treasury-voucher-party-reason-edit` (commit `c57f92e7`, mới nằm trên
nhánh `feat/treasury-voucher-party-reason-edit`) đã dựng xong toàn bộ đường dây đối tượng
tự nhập: `partnerName` trên cả 4 DTO (đã xác nhận trên `/docs-json` của API :4000 đang
chạy), `CashVoucherPartnerType.OTHER` trong TS lẫn enum Postgres, `partner_name_snapshot`,
`mapPartnerFields` ở FE, và nhánh ô nhập tay ở `VoucherPartnerFields.tsx:190`.

Ô nhập tay đó chỉ render khi `partnerKind === OTHER`, và **không control nào trong ứng dụng
đặt được giá trị đó**:

- 4 dialog phiếu (`ReceiptVoucherDialog`, `PaymentVoucherDialog`,
  `DepositReceiptVoucherDialog`, `DepositPaymentVoucherDialog`) không render dropdown
  "Loại đối tượng" nào cả. `setPartnerKind` chỉ được gọi khi hydrate phiếu cũ, khi chọn
  một dòng từ danh mục, hoặc từ menu "Tạo mới" — cả ba đều trả về loại danh mục.
- Nơi duy nhất có dropdown loại là modal "Chọn đối tượng"
  (`VoucherEntitySearchModal.tsx:293`, dùng `PARTNER_LOOKUP_DIALOG_OPTIONS` có mục "Khác").
  Đường này **có chạy**: `onChange` của select chặn free-text **trước** `loadPage`
  (`:303-320`), trả về form một lựa chọn rỗng mang `kind: OTHER` rồi đóng modal, và form
  chuyển ô Đối tượng sang chế độ gõ tay. Không có request 400 nào.
- `VoucherPartnerFields.tsx:88-90` **chủ động lọc bỏ** "Khác" khỏi menu "Tạo mới".

Nói cách khác: chức năng có và đường vào có, nhưng đường vào **không thể tìm ra được** —
muốn nói "đối tượng này không có trong danh mục" thì phải mở hộp thoại *tìm kiếm danh mục*
rồi đổi bộ lọc loại sang "Khác". Không ai đoán ra thao tác đó, và trên form thì ô Tên hiện
ra dưới dạng read-only màu xám, tức là giao diện đang nói thẳng "không gõ được vào đây".

> **Đính chính (2026-09-08).** Bản đầu của tài liệu này kết luận đường modal 400 rồi bị
> `catch {}` nuốt. Sai: kết luận đó rút ra từ `loadPage` + enum backend mà **chưa đọc**
> `onChange` của select, nơi có nhánh chặn free-text đứng trước. Lỗi thật là khả năng tìm
> thấy, không phải lối cụt. Cách sửa (ADR-01) không đổi vì Akenzy đã chốt "chỉ cần fill tên
> thôi"; nhưng ADR-04 phải đổi lập luận, và mức độ hỏng của ý #1 nhẹ hơn báo cáo ban đầu —
> trừ phiếu tiền gửi, nơi vẫn có lỗi cứng (A-R5).

**#2 là lỗi thật, và chỉ ở phiếu tiền mặt.** Cột `partner_address_snapshot` có trên cả 4
bảng chứng từ. Phiếu **tiền gửi** lưu đúng: `CreateBankReceiptDto.address` tồn tại và
`bank-receipts.service.ts:199` ưu tiên `dto.address ?? partner?.address`. Phiếu **tiền
mặt** thì đứt ba chỗ liên tiếp: `CreateCashReceiptDto` / `CreateCashPaymentDto` **không có**
trường `address`; `cash-vouchers.api-body.ts` không gửi nó (grep `address` trong file này
ra 0 kết quả); và với đối tượng tự nhập, `cash-receipts.service.ts:235` còn hard-set
`partnerAddressSnapshot: null`. Ô "Địa chỉ" trên form tiền mặt gõ được, hiện được, và
không bao giờ rời khỏi trình duyệt.

**#3 chưa có thật, nhưng hạ tầng thì đã có gần hết.** Không dialog phiếu nào có nút "In".
Nút "Xuất khẩu" ở `LedgerCashPage.tsx:252` là stub toast; trang danh sách Thu chi
(`TreasuryCashReceiptsPage`) không có nút nào. Nhưng đường ống in + xuất từng chứng từ đã
chạy thật cho chứng từ kho và **generic theo `VoucherKind`**:

| Đã có | Ở đâu |
|---|---|
| `VoucherKind` đã khai sẵn `CASH_RECEIPT`, `CASH_PAYMENT`, `BANK_RECEIPT`, `BANK_PAYMENT` | `packages/shared-interfaces/src/printing/voucher-payload.ts:13-21` |
| `VoucherPrintPayload` đã có `paper: 'A4' \| 'A5'`, chú thích rõ "A5 for treasury" | cùng file, dòng 32-33 |
| Đọc số thành chữ tiếng Việt (rủi ro lớn nhất của kế hoạch In cũ) | `apps/api/src/common/utils/amount-in-words.util.ts` + spec |
| Renderer HTML khổ giấy tham số hoá | `apps/backoffice-web/src/lib/print/render-voucher-html.ts:171` |
| Đường ống xuất .xlsx từng chứng từ | `report-core/export/{voucher-export.adapter,voucher-xlsx.writer,export-pipeline,http-response.sink}.ts` |
| Mẫu controller 2 route (`:id/print-payload` + `:id/export`) | `goods-receipt.controller.ts:95-121` |
| Bộ điều phối FE theo `kind` | `lib/print/{voucher-print.api,voucher-export.api}.ts` |

Việc còn thiếu chỉ là 4 mapper print-payload, 8 route, và nối nút ở 4 dialog + 1 trang
danh sách.

## Affected personas

| Persona | Hiện tại | Mong muốn |
|---|---|---|
| Thủ quỹ / kế toán quỹ | Chi tiền cho người vãng lai thì để trống ô Đối tượng, hoặc chọn bừa một khách hàng có sẵn; địa chỉ gõ vào rồi mất | Gõ thẳng tên và địa chỉ người nhận tiền, lưu đúng, in ra phiếu có đủ tên + địa chỉ để ký nhận |
| Kế toán tổng hợp | Chép tay số liệu Thu chi sang Excel để đối chiếu | Bấm Xuất khẩu, nhận .xlsx theo bộ lọc đang xem |
| Người nhận tiền | Ký vào phiếu viết tay ngoài phần mềm | Ký vào phiếu chi in từ phần mềm |

## Success signal

Tạo được một phiếu chi tiền mặt cho đối tượng không có trong danh mục — gõ tên và địa chỉ,
lưu, mở lại thấy nguyên vẹn, bấm In ra bản A5 có đủ tên + địa chỉ + tiền bằng chữ, bấm Xuất
khẩu tải được .xlsx — mà không phải chạm vào dropdown loại đối tượng nào.

## Out of scope

- **Mẫu in khổ 80mm (máy in nhiệt POS)** — Akenzy chốt 2026-09-08 là chưa cần; UOW-04 của
  `export-print` vốn cũng ghi 80mm là not-in-scope.
- **Danh mục "đối tượng tự nhập"** — không dựng bảng/danh mục riêng cho tên gõ tay; nó chỉ
  là snapshot trên phiếu. Đây là quyết định đã chốt ở feature 2026090701 và giữ nguyên.
- **Sửa / xoá phiếu đã ghi sổ** — đã làm xong ở feature 2026090701.
- **Xuất khẩu Sổ chi tiết tiền mặt (`LedgerCashPage`)** — người dùng hỏi danh sách *Thu
  chi*, không phải *Sổ chi tiết*. Sổ chi tiết đã có kế hoạch riêng ở `export-print` UOW-05
  và không đụng tới ở đây.
- **`deposit-ledger/export` kiểu cũ** — không refactor đường xuất buffer cũ của Sổ tiền
  gửi sang `ExportPipeline`; ngoài phạm vi khiếu nại.

## Constraints

| Kind | Detail |
|---|---|
| Nền tảng | Toàn bộ đường dây đối tượng tự nhập nằm ở commit `c57f92e7`, **chỉ có trên nhánh `feat/treasury-voucher-party-reason-edit`**, chưa merge vào `main`. Feature này phải build tiếp trên nhánh đó, không phải trên `main`. |
| Dữ liệu | Không migration mới: `partner_name_snapshot` và `partner_address_snapshot` đã có trên cả 4 bảng; `CashVoucherPartnerType.OTHER` đã có trong enum Postgres. |
| Bất biến | Phiếu đã ghi sổ là bất biến sau khi post; mọi thay đổi đi qua đường `update()` có `revision` đã dựng ở 2026090701, không viết đường ghi mới. |
| Kế thừa | Phần In phải dùng lại `renderVoucherHtml` + `amount-in-words.util`, phần Xuất phải dùng lại `ExportPipeline` + `VoucherXlsxWriter`. Không dựng khuôn thứ hai. |
| Kiểm chứng | Không có `evidence:` trong `.ai/aidlc.yaml`, nên G4 không tự chạy test; bằng chứng trình duyệt đi qua `aidlc-verify` môi trường `local-backoffice`. |

## Existing surface touched

**Dùng lại (từ `.ai/architecture.md` + khảo sát trên):**
- `report-core/export/`: `ExportPipeline`, `StaticRowsFetcher`, `VoucherXlsxWriter`,
  `HttpResponseSink`, `voucherToReportDocument`
- `common/utils/amount-in-words.util.ts`
- `lib/print/`: `render-voucher-html.ts`, `print-html-document.ts`, `voucher-print.api.ts`,
  `voucher-export.api.ts`
- `VoucherPartnerFields.tsx`, `voucher-partner.constants.ts`, `cash-vouchers.api-body.ts`
- `PartnerResolverService`, `voucher-party.ts`

**Feature liền kề:**
- `2026090701-treasury-voucher-party-reason-edit` — nền tảng trực tiếp; feature này vá nốt
  đường vào UI mà nó bỏ sót.
- `export-print` — **UOW-04 "In phiếu thu chi tiền mặt và tiền gửi (A5)"** (T-04-01..03,
  todo) bị feature này thay thế. `export-print` UOW-05 (Sổ chi tiết tiền mặt) và UOW-08/10
  (chứng từ kho) không đụng tới.

**Điểm vào mới:** không route mới ở FE. Thêm nút In / Xuất khẩu vào 4 dialog phiếu sẵn có
và 1 nút Xuất khẩu vào `TreasuryCashReceiptsPage`; thêm 8 route đọc ở API (2 route × 4 loại
phiếu) + 1 route xuất danh sách.
