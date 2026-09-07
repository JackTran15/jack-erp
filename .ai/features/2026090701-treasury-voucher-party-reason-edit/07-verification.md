---
feature: 2026090701-treasury-voucher-party-reason-edit
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Phiếu thu chi quỹ tiền: đối tượng tự nhập, lý do tự điền, sửa/xoá phiếu

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Màn Thu chi tiền mặt mở được trên chi nhánh đã ghim | `/treasury/cash/receipts-expenses` | — | AC-10 | `text=Thu, chi tiền mặt` |
| S3 | Hộp thoại Phiếu thu có đủ ba ô feature này đụng tới | `/treasury/cash/receipts-expenses` | `click button:has-text("Thêm mới"); click [role="menuitem"]:has-text("Phiếu thu tiền"); wait div:has(> label:text-is("Lý do thu")) input` | AC-01, AC-07 | `text=Lý do thu; text=Đối tượng nộp; text=Diễn giải` |
| S4 | Gõ Lý do thu thì Diễn giải dòng 1 tự điền theo | `/treasury/cash/receipts-expenses` | `click button:has-text("Thêm mới"); click [role="menuitem"]:has-text("Phiếu thu tiền"); wait div:has(> label:text-is("Lý do thu")) input; fill div:has(> label:text-is("Lý do thu")) input = AIDLC tu dien dong mot; click div:has(> label:text-is("Địa chỉ")) input` | AC-07 | `count input[value="AIDLC tu dien dong mot"] = 2` |
| S5 | Phiếu tự sinh không sửa được — nút Sửa xám | `/treasury/cash/receipts-expenses` | `click table tbody tr:first-child` | AC-13, AC-19 | `count button:has-text("Sửa"):disabled = 1` |

## Not verified here

Các tiêu chí sau **không** có bề mặt kiểm được bằng ảnh chụp trong đợt này, và phải nói rõ là
chúng đang **chưa được phủ** chứ không phải đã phủ ở nơi khác:

- **AC-02** — cần lưu phiếu rồi mở lại để thấy tên tự nhập được giữ; cùng lý do "ghi tiền
  thật" như nhóm dưới. Ở tầng service thì đã có test: `cash-receipts.service.spec.ts` khẳng
  định `partner_name_snapshot` lưu đúng và `partner_id` rỗng khi loại là OTHER.
- **AC-04** — mục "Khác" nằm trong hộp thoại Chọn đối tượng, mở qua nút tra cứu bên trong ô
  Đối tượng; bước mở modal cần thêm một vòng dò selector nên không đưa vào đợt này. Đã có test
  khoá bằng vitest: `voucher-partner.constants.test.ts` khẳng định dropdown của target
  `partner` có đủ 4 mục kể cả "Khác", và target thu nợ/nhân viên **không** bị mở thêm.
- **AC-03, AC-05, AC-06, AC-08, AC-09** — cần tạo và lưu phiếu thật rồi mở lại. Chi nhánh mà
  harness ghim (`LOCAL_BACKOFFICE_BRANCH_NAME` = "Hồ Chí Minh") hiện có **0 phiếu thu MANUAL đã
  ghi sổ** trên 44 phiếu tự sinh, nên không có sẵn dữ liệu để thao tác; bước tạo phiếu ghi tiền
  thật vào `erp_dev_3008` (bản sao dữ liệu thật) nên cố ý không đưa vào đợt chạy đầu.
- **AC-11, AC-12, AC-17, AC-18** — sửa/xoá làm đổi số dư quỹ và sinh bút toán bù. Đây là phần
  giá trị nhất của feature nhưng cũng là phần ghi tiền; cần fixture MANUAL dựng riêng.
- **AC-14** (quỹ không đủ tiền) cần hạ `cash_accounts.allow_negative` rồi trả lại — thao tác
  ngoài phạm vi trình duyệt.
- **AC-15** (kỳ đã khoá sổ) cần một kỳ tiền gửi ở trạng thái LOCKED.
- **AC-16** (hai phiên sửa cùng lúc) cần hai session song song — harness một phiên không dựng
  được.

Bảy tiêu chí trên nằm trong phạm vi bốn ticket test **chưa viết**: T-01-06, T-03-06, T-03-07,
T-04-03. Cho tới khi chúng xong, G4 vẫn phải đóng — và đó là trạng thái đúng.

Ở tầng unit/service thì AC-11..AC-19 **đã** có phủ: 464 test xanh trong
`pnpm --filter @erp/api test -- --testPathPattern accounting`, gồm cả test tương đương
"xoá == sửa về 0", test chiều movement hai loại phiếu, test từ chối phiếu saga, test revision
lệch, và test kỳ khoá sổ. Ảnh chụp bổ sung cho những test đó chứ không thay thế.

## Notes

- Không có bước riêng cho menu "Thêm mới": phần tử menu nằm trong portal mà phép kiểm
  `text=` của harness không thấy được, dù `wait` cùng selector đó thành công và S3 bấm vào
  đúng nó. Một bước đỏ vì cơ chế kiểm chứ không vì sản phẩm là bằng chứng giả — S3 đã chứng
  minh menu hoạt động bằng cách dùng nó.

- Chỉ chạy trên `local-backoffice`. POS không đụng tới feature này; `local-backoffice-bm` và
  `local-backoffice-wh` là hai vai trò của một feature khác (PR #240), không liên quan.
- `viewports: [desktop]` — feature không thêm nhánh bố cục nào. Khung `laptop` (1440×720) có
  trong config để bắt popover dài của báo cáo, không áp cho màn này.
- **Bắt buộc trước khi chạy:** API :4000 phải được khởi động lại. Tiến trình `nest start --watch`
  đang phục vụ bản build cũ (chỉ 1/4 update DTO có `revision`), và FE giờ gửi `revision` — với
  `forbidNonWhitelisted: true` thì mọi lệnh sửa sẽ trả 400 dù code đúng.
