---
feature: media-storage
slug: 2026091301-media-storage
owner: Akenzy
created: 2026-09-13
status: draft
---

# Intent — Lưu trữ media: ảnh hàng hoá, ảnh nhân viên, tài liệu đính kèm chứng từ

## Problem

jack-erp không có nơi lưu file. Không có client object storage, không có bảng media, không có
biến môi trường hay service compose nào cho việc này (`.ai/architecture.md` mục M1). Hệ quả
không chỉ là "thiếu tính năng": **ba chỗ giao diện đã nhận file của người dùng rồi âm thầm
làm mất nó**.

| Chỗ | Người dùng thấy | Thực tế | Bằng chứng |
|---|---|---|---|
| Ảnh hàng hoá | Form tạo/sửa hàng hoá cho chọn tối đa 10 ảnh, 2 MB/ảnh, có xem trước | File chỉ nằm trong state `productImages`, thứ duy nhất đọc nó là bộ đếm. Chính màn hình ghi "Ảnh chỉ lưu trên trình duyệt cho đến khi máy chủ hỗ trợ tải lên" | `apps/backoffice-web/src/components/crud/inventory/InventoryItemCreateForm.tsx:112,930-931,939` |
| Ảnh nhân viên | Chọn ảnh, lưu hồ sơ, ảnh hiện ngay | Lưu một URL `blob:` vào `employee_profiles.photo_url`. URL này chỉ sống trong tab đã tạo ra nó, nên mở lại hồ sơ là ảnh vỡ | `apps/backoffice-web/src/pages/employees/components/EmployeeBasicInfoTab.tsx:93-97` → `apps/backoffice-web/src/lib/iam/user-form.ts:55` → `apps/api/src/modules/rbac/employee/employee-profile.entity.ts:72-73` |
| Tài liệu đính kèm chứng từ | Nút "Tài liệu đính kèm" trên phiếu nhập kho, phiếu thu… | Nút bị disable. 7 bảng chứng từ có cột `attachment_ids jsonb` trỏ vào một bảng không tồn tại | `apps/backoffice-web/src/components/document/GoodsReceiptFormDialog.tsx:2304-2307`, `apps/backoffice-web/src/pages/treasury/documents/receipt-voucher-dialog/ReceiptVoucherDialog.tsx:860-867`; bảng cột ở M3 |

Hai hợp đồng API đang giữ chỗ cho ảnh: POS `imageUrl` luôn `null`
(`apps/api/src/modules/pos/services/pos-catalog-product.service.ts:213,651,675,703`), API đối
tác `images[]` luôn `[]` và bị test khoá
(`apps/api/src/modules/partner-catalog/partner-catalog-contract.spec.ts:152-156`). Feature
`2026090903-partner-catalog-api` và ba epic trước đó (M1) đều đẩy việc lưu ảnh sang "feature
riêng". Đây là feature đó.

## Affected personas

| Persona | Hành vi hiện tại | Hành vi mong muốn |
|---|---|---|
| Nhân viên quản lý hàng hoá (backoffice) | Chọn ảnh, lưu, mở lại thì ảnh không còn | Ảnh còn nguyên sau khi tải lại trang, hiện ở màn sửa hàng hoá |
| HR / quản lý chi nhánh | Ảnh nhân viên vỡ sau khi đóng tab | Ảnh hiển thị ổn định; người không đăng nhập không xem được |
| Kế toán, thủ kho | Không đính kèm được file vào phiếu vì nút bị khoá | Đính kèm file vào đúng phiếu, mở lại phiếu là tải về được |
| Thu ngân POS, đối tác storefront | `imageUrl` / `images[]` luôn rỗng | Nhận URL ảnh công khai, ổn định, cache được |

## Success signal

Tín hiệu chính: **file người dùng chọn trong backoffice vẫn mở được sau khi tải lại trang, ở
cả ba chỗ.** Kiểm được bằng demo script của từng UoW, không phải bằng lời.

Các kiểm tra đo được:

- Ảnh hàng hoá: tạo hàng hoá kèm 3 ảnh, tải lại màn sửa, thấy đúng 3 ảnh; catalog POS trả
  `imageUrl` khác `null` cho sản phẩm đó.
- Ảnh nhân viên: sau migration, `SELECT count(*) FROM employee_profiles WHERE photo_url LIKE 'blob:%'`
  trả 0; ảnh mới tải lên vẫn hiện sau khi tải lại trang.
- Đính kèm: đính kèm 1 file PDF vào phiếu nhập kho, mở lại phiếu, tải về được file có cùng kích
  thước và checksum.
- Không byte file nào đi qua NestJS: số chỗ dùng `FileInterceptor` trong `apps/api/src` không
  tăng so với commit `743b485a`.
- Object riêng tư (ảnh nhân viên, đính kèm) gọi thẳng không có chữ ký thì storage trả 403.

## Out of scope

- **Xử lý ảnh phía server** (resize, thumbnail, xoá EXIF, đổi sang webp). Repo không có thư
  viện ảnh (`sharp` không được import ở đâu — M1). Lưu nguyên file người dùng tải lên. (A-24)
- **Tải lên từ pos-web.** pos-web không gửi được file qua cả hai lớp HTTP (M2). POS chỉ nhận
  `imageUrl` qua API và **không** hiển thị ảnh trong v1. (A-11, A-20)
- **Ảnh trong module mobile.** Mobile loại ảnh có chủ đích
  (`apps/api/src/modules/mobile/dto/mobile-sales-model-stock.response.dto.ts:9-13`). (A-12)
- **Logo tổ chức/chi nhánh, ảnh khách hàng.** Chủ sở hữu loại khỏi v1 ngày 2026-09-13. (A-01)
- **Đính kèm cho phiếu xuất kho, kiểm kê, kiểm quỹ.** UI có nhãn "Tài liệu đính kèm" nhưng
  bảng không có cột `attachment_ids`, cần migration riêng. (A-14)
- **Vận hành MinIO ở production**: HA, replication, backup, giám sát dung lượng. Feature chỉ
  cung cấp cấu hình, lệnh khởi tạo bucket và hướng dẫn nginx. (A-07)
- **Chuyển production sang HTTPS.** (A-21)
- **Thay MinIO bằng một S3-compatible khác.** Không làm trong feature này; code chỉ dùng S3 API
  chuẩn để việc đó về sau chỉ là đổi cấu hình (sẽ thành ADR ở G2).
- **Quét virus file đính kèm.** Giảm nhẹ bằng danh sách định dạng cho phép và tải về dạng
  `Content-Disposition: attachment`. (A-09)
- **Sắp xếp lại thứ tự ảnh bằng kéo thả.** UI hiện chỉ có thêm/xoá; thứ tự là thứ tự tải lên.

## Constraints

| Kind | Detail |
|---|---|
| Storage engine | MinIO community edition bị archive ngày 2026-04-25, chỉ phân phối mã nguồn, không bảo đảm vá bảo mật. Chủ sở hữu **chấp nhận rủi ro** và giữ MinIO (2026-09-13, A-03). Local compose ghim tag image cuối cùng được publish |
| Đường đi file | Trình duyệt gửi file thẳng lên storage bằng presigned POST có policy giới hạn kích thước và loại file; API chỉ cấp vé và xác nhận (A-02, ADR-02). Không thêm `FileInterceptor` |
| Mạng production | Production chạy **HTTP thuần** (`apps/pos-web/src/lib/common/crypto-polyfill.ts:1-10`); backoffice + POS + API chung một origin sau nginx, cấu hình nginx **không có trong repo** (M5). Trình duyệt phải với tới được MinIO, nên có phụ thuộc vào thay đổi nginx do người vận hành làm (A-06) |
| Chữ ký | Presigned POST ký trên policy, không phụ thuộc host/path. Presigned GET (đọc file riêng tư) ký cả host và path, nên phải được sinh theo đúng host/path trình duyệt gọi, không phải host nội bộ mà API dùng để nói chuyện với MinIO |
| HTTP client FE | Không gửi file lên storage qua `erpApi`/axios: interceptor gắn `Authorization`, `X-Branch-Id`, `X-Idempotency-Key` vào mọi request (`apps/backoffice-web/src/lib/api-axios.ts:37-55`), tức là lộ access token sang storage |
| Đa tổ chức | Mọi bản ghi media lọc theo `actor.organizationId`; key object mang `organizationId`; id media của tổ chức khác được coi là không tồn tại |
| Chứng từ sau ghi sổ | CLAUDE.md ghi giao dịch nghiệp vụ bất biến sau ghi sổ, **nhưng code cho sửa**: phiếu nhập kho `POSTED` vẫn sửa được (`goods-receipt.service.ts:267`), phiếu chuyển kho `POSTED` sửa bằng bút toán đảo (`stock-transfer.service.ts:552`), phiếu thu/chi tiền mặt và ngân hàng đi qua `assertEditable` (`editable-voucher.util.ts:43-66`). Chỉ trạng thái kết thúc (`CANCELLED`, `REVERSED`, `COMPLETED`) bị khoá. Đính kèm theo đúng khả năng sửa của chứng từ (A-26) |
| Cấu hình | Không có schema validate env (M4). Thiếu biến storage phải báo lỗi rõ khi dùng, nhưng **không** được làm API không khởi động: e2e boot `AppModule` thật và CI không có object store (M10) |
| RBAC | Khoá quyền mới (nếu có) phải vào `permissions.seed.ts`, `permission-labels-vi.ts`, `org-role-permissions.ts` **và** danh sách cứng ở `apps/api/test/e2e/setup/test-app.ts:135-166` (M7) |
| Validation | `ValidationPipe` `forbidNonWhitelisted`: DTO xin URL / xác nhận tải lên phải khai đủ mọi trường |
| DB | `synchronize: false`; migration viết tay |
| OpenAPI | Sau khi đổi endpoint chạy `pnpm openapi:generate`, commit `schema.ts` + `openapi.snapshot.json` |
| Ngôn ngữ | Code, log, comment backend tiếng Anh; chuỗi UI và tài liệu planning tiếng Việt |
| Feature liền kề | `2026090903-partner-catalog-api` còn 4/18 ticket chưa xong; đổi giá trị `images[]` phải phối hợp (A-10) |

## Existing surface touched

- **Ảnh hàng hoá (FE)**: `apps/backoffice-web/src/components/crud/inventory/InventoryItemCreateForm.tsx`,
  `apps/backoffice-web/src/components/crud/inventory/item-create/constants.ts`; được mount tại
  `apps/backoffice-web/src/components/crud/CrudCreatePage.tsx:232` và `CrudEditPage.tsx:227`
- **Ảnh nhân viên**: FE `apps/backoffice-web/src/pages/employees/components/EmployeeBasicInfoTab.tsx`,
  `apps/backoffice-web/src/lib/iam/user-form.ts`, `apps/backoffice-web/src/pages/employees/employee.mappers.ts`;
  BE `apps/api/src/modules/rbac/employee/employee-profile.entity.ts`,
  `apps/api/src/modules/rbac/dto/employee-profile.dto.ts`, `apps/api/src/modules/rbac/users.service.ts`;
  type dùng chung `packages/shared-interfaces/src/iam/index.ts`
- **Chứng từ có `attachment_ids`**: goods-receipt, transfer-order, stock-transfer (inventory);
  cash-receipts, cash-payments, bank-receipts, bank-payments (accounting). Entity/DTO và dialog
  FE liệt kê ở M3
- **Hợp đồng đọc**: `apps/api/src/modules/pos/services/pos-catalog-product.service.ts`,
  `apps/api/src/modules/pos/dto/pos-catalog-product.response.dto.ts`;
  `apps/api/src/modules/partner-catalog/queries/search-partner-products.handler.ts`,
  `get-partner-product.handler.ts`, `partner-catalog-contract.spec.ts`
- **Mẫu provider client để copy**: `apps/api/src/modules/redis/redis.service.ts`, `redis.module.ts` (M4)
- **Job định kỳ**: `ScheduleModule` đã đăng ký (`apps/api/src/app.module.ts:95`); mẫu
  `apps/api/src/modules/pos/services/overdue-debts.service.ts`
- **Hạ tầng**: `docker-compose.yml`, `apps/api/.env.example`, `apps/api/ecosystem.config.cjs`
  (whitelist env của PM2)
- **Component FE ứng viên tái dùng**: `apps/backoffice-web/src/components/forms/FileDropZone.tsx`
  (chưa có nơi import); slot `attachments` ở `packages/ui/src/components/document-form-dialog.tsx`
- **Module mới (dự kiến)**: `apps/api/src/modules/media/`, chưa tồn tại
