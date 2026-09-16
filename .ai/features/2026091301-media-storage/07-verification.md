---
feature: 2026091301-media-storage
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Lưu trữ media

Chạy trên `erp_dev` (API khởi động bằng `DB_NAME=erp_dev pnpm --filter @erp/api dev` — `apps/api/.env`
có khối `DB_NAME` thứ hai ở cuối file thắng khối đầu), tổ chức **My Company**
(`f1000000-0000-4000-8000-000000000001`), tài khoản `admin@erp.local`, chi nhánh **Hồ Chí Minh**
(`LOCAL_BACKOFFICE_BRANCH_NAME` trong `.ai/credentials.env`; `post_login` ghim chi nhánh này).
MinIO local qua Vite proxy (`/erp-media-public`, `/erp-media-private` → `:9000`).

Runner chỉ có `click/fill/wait/scroll`, không chọn được file. Vì vậy mọi lượt tải lên được làm
bằng `verify-fixtures.py` **đúng luồng trình duyệt dùng** (vé `POST /media/uploads` → multipart
POST thẳng tới storage, không header ERP → `POST /media/uploads/:id/complete`) rồi gắn vào chủ sở
hữu qua endpoint của chính chủ sở hữu; trình duyệt chứng minh đường đọc. Trước mỗi lần chạy:

```bash
python3 .ai/features/2026091301-media-storage/verify-fixtures.py --reset --check   # fixture + api-checks.json
~/.venvs/aidlc-verify/bin/python .ai/capture-session.py                            # phiên (refresh token xoay vòng, dùng 1 lần)
aidlc-verify .ai/features/2026091301-media-storage --write
aidlc-evidence .ai/features/2026091301-media-storage
```

`--reset` gắn lại đúng 3 ảnh cho hàng hoá A vì S17 xoá một ảnh và lưu. Fixture (số chứng từ đổi
khi script tạo bộ mới — nó chỉ nhận lại chứng từ tạo **trong cùng tuần ISO**, vì trang danh sách
lọc mặc định "tuần này"/"tháng này"; khi đó cập nhật cột Path/Interaction bên dưới):

| Fixture | Chủ sở hữu | File | Ghi chú |
|---|---|---|---|
| NV000001 (`staff-hcm@erp.local`) | `EMPLOYEE_PROFILE` | `nhan-vien-hcm.png` ~1 MB | AC-09; `photo_url` là link ký `X-Amz-*` |
| NV000002 (`staff-hn@erp.local`) | — | — | AC-11: `photo_url` NULL, hiện placeholder |
| `AAA-MEDIA-A` product `0305db48-983a-43d5-a0f8-eca771444836` | `PRODUCT` (Màu Đen/Trắng × Size 39/40) | `anh-a-1..3.png` | AC-01, AC-04 |
| `AAA-MEDIA-B` item `b386822a-e432-4af7-808c-42f8c7df84b4` | `ITEM` (không biến thể, A-25) | `anh-b.png` | AC-01; URL công khai `/erp-media-public/org/f1000000-…/item/bb920950-5903-42d8-9727-775a75c009fd` |
| `AAA-MEDIA-C` item `7fa5daba-f56f-439b-b9fe-2dc30e6f5e34` | — | — | không ảnh (AC-05) |
| IMP000031 phiếu nhập hàng mua (POSTED) | `GOODS_RECEIPT` | `hop-dong-nhap-kho.pdf` 3 MB | AC-13, AC-14, AC-16 |
| LDC000009 lệnh chuyển kho (DRAFT, HCM → HN) | `TRANSFER_ORDER` | `lenh-chuyen-kho.pdf` | AC-14 |
| CK000018 phiếu chuyển kho (POSTED) | `STOCK_TRANSFER` | `phieu-chuyen-kho.pdf` | AC-14 |
| PT000079 phiếu thu (POSTED) | `CASH_RECEIPT` | `bien-lai-thu.png` | AC-14 |
| PT000080 phiếu thu (REVERSED, đảo bằng PT000081) | `CASH_RECEIPT` | `bien-lai-thu-da-dao.png` | AC-16 |
| PC000075 phiếu chi (POSTED) | `CASH_PAYMENT` | `chung-tu-chi.pdf` | AC-14 |
| NTTK000029 thu ngân hàng (POSTED) | `BANK_RECEIPT` | `giay-bao-co.pdf` | AC-14 |
| UNC000061 chi ngân hàng (POSTED) | `BANK_PAYMENT` | `uy-nhiem-chi.pdf` | AC-14 |

Các trang chứng từ không có deep link: mỗi bước chọn dòng theo số chứng từ rồi bấm "Xem"/"Sửa"
trên thanh công cụ; `scroll` kéo ô "Tài liệu đính kèm" (nằm dưới bảng chi tiết) vào khung hình
trước khi chụp. Bước ghi dữ liệu (S17) đặt cuối cùng.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Ảnh nhân viên: mở lại hồ sơ NV000001 thấy ảnh, `src` là link ký của bucket riêng tư, không phải `blob:` | `/admin/employees` | `click tr:has-text("NV000001"); click button:has-text("Sửa"); wait img[src*="/erp-media-private/"]` | AC-09 | count img[src*="/erp-media-private/"] = 1;count img[src^="blob:"] = 0;count button[aria-label="Bỏ ảnh"] = 1 |
| S2 | Nhân viên `photo_url` NULL (NV000002): ô ảnh hiện placeholder, không có thẻ img vỡ | `/admin/employees` | `click tr:has-text("NV000002"); click button:has-text("Sửa"); wait text=Định dạng ảnh` | AC-11 | text=Định dạng ảnh;count img[src*="/erp-media-"] = 0;count img[src^="blob:"] = 0;count button[aria-label="Bỏ ảnh"] = 0 |
| S3 | Hàng hoá có màu/size: màn sửa hiện đúng 3 ảnh từ bucket công khai | `/admin/inventory-items/0305db48-983a-43d5-a0f8-eca771444836/edit` | `wait #create-code[value="AAA-MEDIA-A"]; wait img[src*="/erp-media-public/"]` | AC-01 | count img[src*="/erp-media-public/"] = 3;count button[aria-label="Xóa ảnh"] = 3;text=Thêm hình ảnh (3/10) |
| S4 | Hàng hoá không biến thể (A-25): màn sửa hiện đúng 1 ảnh | `/admin/inventory-items/b386822a-e432-4af7-808c-42f8c7df84b4/edit` | `wait #create-code[value="AAA-MEDIA-B"]; wait img[src*="/erp-media-public/"]` | AC-01 | count img[src*="/erp-media-public/"] = 1;count button[aria-label="Xóa ảnh"] = 1;text=Thêm hình ảnh (1/10) |
| S5 | URL công khai của ảnh hàng hoá mở thẳng trong trình duyệt, không chữ ký, không Authorization → ảnh hiện | `/erp-media-public/org/f1000000-0000-4000-8000-000000000001/item/bb920950-5903-42d8-9727-775a75c009fd` | — | AC-07 | count img = 1;no-text=AccessDenied;no-text=NoSuchKey |
| S6 | Object ảnh nhân viên gọi không chữ ký → storage trả tài liệu lỗi XML (403 AccessDenied), không phải ảnh | `/erp-media-private/org/f1000000-0000-4000-8000-000000000001/employee_profile/ce37f4a4-eede-437c-b84d-b327c8c7e3e5` | — | AC-10 | count Error = 1;count Code = 1;count img = 0 |
| S7 | Phiếu nhập hàng IMP000031 mở lại: thấy file với tên gốc, kích thước 3 MB và nút tải về | `/purchases/imports` | `click tr:has-text("IMP000031"); click button:has-text("Xem"); wait text=hop-dong-nhap-kho.pdf; scroll text=hop-dong-nhap-kho.pdf` | AC-13, AC-14 | text=hop-dong-nhap-kho.pdf;text=3 MB;text=Đã tải lên;count button[aria-label="Tải về"] = 1 |
| S8 | Lệnh chuyển kho LDC000009 mở lại: thấy file đính kèm | `/inventory/transfer-orders` | `click tr:has-text("LDC000009"); click button:has-text("Xem"); wait text=lenh-chuyen-kho.pdf; scroll text=lenh-chuyen-kho.pdf` | AC-14 | text=lenh-chuyen-kho.pdf;count button[aria-label="Tải về"] = 1 |
| S9 | Phiếu chuyển kho CK000018 mở lại: thấy file đính kèm | `/inventory/stock-transfers` | `click tr:has-text("CK000018"); click button:has-text("Xem"); wait text=phieu-chuyen-kho.pdf; scroll text=phieu-chuyen-kho.pdf` | AC-14 | text=phieu-chuyen-kho.pdf;count button[aria-label="Tải về"] = 1 |
| S10 | Phiếu thu tiền mặt PT000079 mở lại: thấy file đính kèm | `/treasury/cash/receipts-expenses` | `click tr:has-text("PT000079"); wait tr:has-text("PT000079") input:checked; click button:has-text("Xem"); wait text=bien-lai-thu.png; scroll text=bien-lai-thu.png` | AC-14 | text=bien-lai-thu.png;count button[aria-label="Tải về"] = 1 |
| S11 | Phiếu chi tiền mặt PC000075 mở lại: thấy file đính kèm | `/treasury/cash/receipts-expenses` | `click tr:has-text("PC000075"); wait tr:has-text("PC000075") input:checked; click button:has-text("Xem"); wait text=chung-tu-chi.pdf; scroll text=chung-tu-chi.pdf` | AC-14 | text=chung-tu-chi.pdf;count button[aria-label="Tải về"] = 1 |
| S12 | Phiếu thu ngân hàng NTTK000029 mở lại: thấy file đính kèm | `/treasury/deposit/receipts-expenses` | `click tr:has-text("NTTK000029"); wait tr:has-text("NTTK000029") input:checked; click button:has-text("Xem"); wait text=giay-bao-co.pdf; scroll text=giay-bao-co.pdf` | AC-14 | text=giay-bao-co.pdf;count button[aria-label="Tải về"] = 1 |
| S13 | Phiếu chi ngân hàng UNC000061 mở lại: thấy file đính kèm | `/treasury/deposit/receipts-expenses` | `click tr:has-text("UNC000061"); wait tr:has-text("UNC000061") input:checked; click button:has-text("Xem"); wait text=uy-nhiem-chi.pdf; scroll text=uy-nhiem-chi.pdf` | AC-14 | text=uy-nhiem-chi.pdf;count button[aria-label="Tải về"] = 1 |
| S14 | Phiếu nhập đã ghi sổ vẫn sửa được: ở màn Sửa, ô đính kèm cho gỡ file và đính kèm thêm | `/purchases/imports` | `click tr:has-text("IMP000031"); click button:has-text("Sửa"); wait text=hop-dong-nhap-kho.pdf; scroll text=hop-dong-nhap-kho.pdf` | AC-16 | text=hop-dong-nhap-kho.pdf;count button[aria-label="Gỡ tệp"] = 1;count button:has-text("Đính kèm tệp") = 1 |
| S15 | Phiếu thu đã đảo PT000080: nút Sửa trên thanh công cụ bị khoá | `/treasury/cash/receipts-expenses` | `click tr:has-text("PT000080"); wait tr:has-text("PT000080") input:checked` | AC-16 | count button:has-text("Sửa"):disabled = 1 |
| S16 | Phiếu thu đã đảo PT000080 mở Xem: file vẫn liệt kê và tải về được, nhưng không gỡ/không đính kèm thêm | `/treasury/cash/receipts-expenses` | `click tr:has-text("PT000080"); wait tr:has-text("PT000080") input:checked; click button:has-text("Xem"); wait text=bien-lai-thu-da-dao.png; scroll text=bien-lai-thu-da-dao.png` | AC-16 | text=bien-lai-thu-da-dao.png;count button[aria-label="Tải về"] = 1;count button[aria-label="Gỡ tệp"] = 0;count button:has-text("Đính kèm tệp") = 0 |
| S17 | Hàng hoá A: xoá 1 ảnh rồi Lưu thành công | `/admin/inventory-items/0305db48-983a-43d5-a0f8-eca771444836/edit` | `wait #create-code[value="AAA-MEDIA-A"]; wait img[src*="/erp-media-public/"]; click button[aria-label="Xóa ảnh"]; click text="Lưu"; wait [data-sonner-toast]` | AC-04 | text=Đã cập nhật |
| S18 | Hàng hoá A: mở lại màn sửa chỉ còn 2 ảnh | `/admin/inventory-items/0305db48-983a-43d5-a0f8-eca771444836/edit` | `wait #create-code[value="AAA-MEDIA-A"]; wait img[src*="/erp-media-public/"]` | AC-04 | count img[src*="/erp-media-public/"] = 2;count button[aria-label="Xóa ảnh"] = 2;text=Thêm hình ảnh (2/10) |

## Not verified here

- **AC-02**, **AC-17** (chặn phía client: file không phải ảnh / quá 2 MB hay 10 MB / file thứ 11 / `.svg`,
  `.html`): cần chọn file trong trình duyệt, runner không có verb đó. Kiểm tay ở G4 theo ô "Trước merge
  — trình duyệt" của UOW-02 (T-02-02) và UOW-04 (T-04-07, T-04-08); logic là `validateFileAgainstLimits`
  (`media-limits.ts`) và `addImages` (`InventoryItemCreateForm.tsx`).
- **AC-03** (server không tin client), **AC-08** (cách ly tổ chức), **AC-12** (quyền xin vé): không có bề mặt
  UI; e2e `media-upload.e2e-spec.ts`, `media-product-images.e2e-spec.ts` (ca `mediaId` tổ chức khác → 404).
- **AC-05** (POS catalog trả `imageUrl`), **AC-06** (API đối tác `images[]`): là response API, không có bề mặt
  backoffice. AC-05 đã kiểm bằng API (`GET /pos/branches/{HCM}/catalog/products?search=AIDLC` → A/B có
  `imageUrl`, C `null`; xem Notes và `evidence/api-checks.json`) và unit `pos-catalog` handler; S5 chỉ mở một
  URL công khai lấy từ AC-05/06. AC-06 cần `X-Api-Key` mà tài khoản verify không có `api-key.create` nên
  không cấp được từ đây — unit `search-partner-products.handler.spec`, `get-partner-product.handler.spec`,
  contract `partner-catalog-contract.spec.ts` (UOW-03 DoD).
- **AC-15** (403 cho người không có quyền xem phiếu thu): cần tài khoản thứ hai; e2e
  `media-attachments.e2e-spec.ts` ca "AC-15". Vế link hết hạn: `ATTACHMENT_URL_EXPIRES_SEC` trong
  `media-download.service.spec.ts`; storage từ chối chữ ký sai được ghi ở Notes.
- **AC-18** (dựng local một lệnh), **AC-19** (MinIO tắt → API vẫn lên, 503 `STORAGE_UNAVAILABLE`, form
  không mất dữ liệu): cần tắt/bật MinIO giữa chừng; e2e chạy với `MEDIA_S3_ENDPOINT=http://127.0.0.1:1`
  (UOW-01 DoD) và ô "Trước merge — trình duyệt" T-01-09 (2).
- **AC-20** (job dọn file rác): không có UI; `media-cleanup.job.spec.ts` và demo UOW-05 (`media:cleanup`).

Chỉ nêu ở mục này mã của tiêu chí hoàn toàn không có bước tự động; `evidence_check.py` bỏ qua kiểm tra độ
phủ của các mã xuất hiện ở đây.

## Notes

- **Ngoài runner, đã kiểm bằng API** (`verify-fixtures.py --check`, kết quả ở `evidence/api-checks.json`,
  2026-09-15): AC-13 `GET /media/:id/download-url` của IMP000031 → tải về 200, `Content-Disposition:
  attachment; filename="hop-dong-nhap-kho.pdf"`, `application/pdf`, 3.146.427 byte, SHA-256 trùng file gốc;
  AC-15 (vế storage) link ký bị sửa chữ ký → 403 `SignatureDoesNotMatch`; AC-10 object ảnh nhân viên không
  chữ ký → 403 `AccessDenied`, có chữ ký → 200 `image/png`; AC-07 URL công khai không query string → 200
  `image/png`, byte trùng `anh-a-1.png` (local MinIO không đặt `Cache-Control`; production đặt ở nginx,
  runbook T-05-02); AC-05 `GET /pos/branches/{HCM}/catalog/products?search=AIDLC` → A `imageUrl` = URL ảnh
  đầu tiên (`.../product/04bc640f-…`), B = ảnh của B (`.../item/bb920950-…`), C = `null`.
- Thứ tự ảnh (AC-01 "đúng thứ tự đã tải lên"): S3 chỉ đếm; thứ tự chứng minh bằng API — `images[]` của A
  trả `anh-a-1, anh-a-2, anh-a-3` đúng thứ tự `imageIds` đã gửi, và `imageUrl` ở AC-05 là media của
  `anh-a-1`.
- AC-04 vế "URL ảnh đã xoá trả 404 sau job dọn": sau S17, dòng `media_objects` của ảnh bị gỡ chuyển
  `DELETED`; object chỉ bị xoá khi `pnpm --filter @erp/api media:cleanup` chạy (ADR-05: cần `created_at`
  quá 11 phút). Sau lần chạy, chạy job rồi `curl -I` URL cũ → ghi kết quả vào đây.
- AC-11: `erp_dev` không có dòng `photo_url LIKE 'blob:%'` trước migration `ClearBlobEmployeePhotoUrls`
  (đếm 0, T-01-08), nên S2 chỉ chứng minh trạng thái NULL → placeholder, không chứng minh việc dọn.
- AC-16 vế API (PATCH `attachmentIds` trên phiếu REVERSED bị từ chối 409): e2e `media-attachments.e2e-spec.ts`
  ca "AC-16"; S15/S16 là mặt UI (Sửa khoá, danh sách chỉ đọc).
- Phiên: `capture-session.py` phải chạy ngay trước `aidlc-verify` — refresh token xoay vòng và bị thu hồi
  sau một lần dùng (`auth.service.ts` `revokeSession`), nên `.ai/.auth/local-backoffice.json` chỉ dùng được
  cho một lần khởi tạo context; cũng vì thế feature này khai một viewport.
- Fixture đã tạo trên `erp_dev` là chứng từ thật (phiếu nhập hàng mua và phiếu chuyển kho ghi sổ kho
  1 đơn vị; 4 chứng từ quỹ/ngân hàng ghi sổ; 1 phiếu thu đảo). Lần chạy tay đầu tiên (trước khi script
  ổn định) để lại bộ trùng IMP000030, LDC000008, CK000017, PT000076–PT000078, PC000074, NTTK000028,
  UNC000060, và PT000081/PT000082 là cặp đảo thừa của PT000080 do lỗi tìm fixture đã sửa — đều mang tiền tố
  "AIDLC media-storage" trong diễn giải, không dùng trong bảng trên.
