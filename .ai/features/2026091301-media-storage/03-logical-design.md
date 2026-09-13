---
feature: media-storage
adr_count: 6
---

# Logical design — Lưu trữ media

Thiết kế ở mức hợp đồng và ranh giới. Mọi `file:line` lấy từ `main` @ `743b485a`; `M…` trỏ tới
section media storage trong `.ai/architecture.md`; `A-…` trỏ tới `01-assumptions.md`. 6 ADR được
Akenzy chấp nhận ngày 2026-09-13.

## Approach

Một module mới `apps/api/src/modules/media/` sở hữu toàn bộ vòng đời file. Module nghiệp vụ
(inventory, rbac, 7 chứng từ) **không bao giờ nói chuyện với storage**; chúng chỉ gọi service của
module media để gắn, gỡ và đọc media của bản ghi mình.

| Thành phần | Trách nhiệm |
|---|---|
| `MediaModule` | `@Global()` theo mẫu `RedisModule` (`apps/api/src/modules/redis/redis.module.ts:7-12`), export `MediaLinkService`, `MediaQueryService`, `MediaOwnerReaderRegistry` để 7 module chứng từ không phải sửa `imports`. **Không** export `ObjectStorageService`: module nghiệp vụ không được tự ký URL cho object key bất kỳ, bỏ qua lọc tổ chức (security review T-01-02, 2026-09-13) |
| Bảng `media_objects` | Nguồn sự thật cho mọi file (ADR-03) |
| `ObjectStorageService` | Bọc `@aws-sdk/client-s3`, `@aws-sdk/s3-presigned-post`, `@aws-sdk/s3-request-presigner` (ADR-01). Không gọi mạng khi khởi tạo; cấu hình đọc qua hàm thuần `resolveMediaStorageConfig(config)` theo mẫu `resolveKafkaConfig` (`kafka-config.ts:34-78`), trả `null` khi thiếu biến → mọi thao tác ném `STORAGE_UNAVAILABLE`, API vẫn khởi động (AC-19, A-22) |
| `MEDIA_OWNER_POLICIES` | Hằng số **tĩnh** theo `ownerType`: bucket, giới hạn, quyền ghi, quyền đọc. Cùng kiểu bảng tra `EXTRA_PURPOSE_PERMISSION_OF` ở `mobile-stock-document-write.service.ts:261`. Không import service nghiệp vụ nào |
| `MediaOwnerReaderRegistry` | Module chủ sở hữu đăng ký trong `onModuleInit` một hàm `(ownerId, actor) => Promise<boolean>` trả `true` khi actor xem được bản ghi đó, theo mẫu `EntityRegistryService.registerEntity` của nền tảng CRUD. Tránh vòng import media ↔ inventory/accounting (ADR-06) |
| `MediaUploadController` + `MediaUploadService` | Cấp vé tải lên, xác nhận tải lên, cấp link tải về |
| `MediaLinkService` | Ghi: `syncOwner`, `detachAll` |
| `MediaQueryService` | Đọc: `listForOwners(ownerType, ownerIds, organizationId)`, `resolvePublicUrls(ownerIds, organizationId)` → `{ id, url, fileName }[]` theo chủ sở hữu, `publicUrlFor(summary)`, `signReadUrl(summary, organizationId, disposition)` (interface chốt sau review T-01-06) |
| `MediaCleanupJob` | `@Cron` hằng ngày; `ScheduleModule` đã đăng ký (`app.module.ts:95`) |
| `MediaException` | `extends HttpException` với `public readonly code`, như `AuthException` (`common/exceptions/auth.exception.ts:4-10`), vì filter chỉ lấy `code` từ thuộc tính của exception (`http-exception.filter.ts:30-36`) |

### Luồng ghi

1. **Xin vé** — FE `POST /media/uploads` với `ownerType`, `fileName`, `contentType`, `size`.
   Service kiểm quyền ghi của `ownerType` bằng `RbacService.hasAnyPermission`
   (`rbac.service.ts:56`), đúng cách `scopedActor` làm ở
   `mobile-stock-document-write.service.ts:236-274`; kiểm giới hạn của policy; tạo dòng
   `PENDING`; trả presigned POST hạn 10 phút (ADR-02).
2. **Tải byte** — FE gửi `multipart/form-data` thẳng tới `${MEDIA_PUBLIC_BASE_URL}/${bucket}`
   bằng `fetch` trần. Không qua `erpApi`/axios vì interceptor gắn `Authorization`,
   `X-Branch-Id`, `X-Idempotency-Key` vào mọi request (`apps/backoffice-web/src/lib/api-axios.ts:37-55`).
3. **Xác nhận** — FE `POST /media/uploads/:id/complete`. Service gọi `HeadObject`: object phải
   tồn tại, `ContentLength` bằng `size` đã khai và ≤ giới hạn, `ContentType` thuộc allowlist.
   Đúng → `UPLOADED`. Sai → xoá object, `DELETED`, ném `MEDIA_INVALID` (AC-03).
4. **Gắn chủ sở hữu** — FE lưu bản ghi nghiệp vụ kèm danh sách id (`imageIds`,
   `profile.photoMediaId`, `attachmentIds`). Service nghiệp vụ, **sau khi chính nó đã kiểm quyền
   sửa và trạng thái của bản ghi**, gọi `MediaLinkService.syncOwner(ownerType, ownerId, ids, actor, manager?)`:
   - Mỗi id phải cùng `organizationId` và cùng `ownerType`; và hoặc là `UPLOADED` do chính actor
     tạo, hoặc đã `ATTACHED` vào chính chủ sở hữu này. Sai tổ chức / không tồn tại → 404
     `MEDIA_NOT_FOUND`; sai trạng thái hoặc đã thuộc chủ sở hữu khác → 409 `MEDIA_STATE_CONFLICT`.
   - Thứ tự trong mảng thành `sort_order`. Vượt số lượng của policy → 400 `MEDIA_LIMIT_EXCEEDED`.
   - Id đang gắn mà không còn trong mảng → `DELETED`; object xoá sau commit (ADR-05). Media không
     có luật trạng thái riêng: chứng từ ở trạng thái kết thúc đã bị chính endpoint sửa của nó từ
     chối trước khi tới bước này (A-26).
   - Trả mảng id đã sắp xếp để service chứng từ ghi lại vào `attachment_ids` (ADR-03).
   - **Luật cho mọi caller** (security review T-01-05, 2026-09-13) — reviewer của T-01-07, T-02-01,
     T-04-02..05 phải kiểm:
     - `ownerType` và `ownerId` luôn là bản ghi **đang được lưu** mà service đã tự kiểm quyền và phạm vi,
       không bao giờ lấy từ body request. `ids` thì từ body là đúng.
     - Đang ở trong transaction nghiệp vụ thì **bắt buộc** truyền `manager`; gọi không kèm `manager` sẽ
       commit việc gỡ và xoá object ngay, dù transaction ngoài rollback sau đó (mất bảo vệ của ADR-05).
     - Chỉ truyền `undefined` khi client không gửi trường; `null` từ body không được hiểu là "không đổi".
     - Phía đọc (review T-01-06): `MediaSummary` giữ `bucket`, `objectKey`, `ownerType` **chỉ ở server** —
       response chép đúng các trường cần trả (`id`, `fileName`, `contentType`, `size`, `url`), không spread
       summary. `signReadUrl` luôn nhận `organizationId` của actor và tự từ chối key ngoài tổ chức đó.

**Transaction.** Khi service nghiệp vụ có sẵn transaction thì `syncOwner` chạy trong đó (item
đơn: `item-crud.service.ts:365,451`). `createProductWithVariants` và
`updateProductWithVariants` **không** chạy trong transaction (`item-crud.service.ts:826-837,974`),
nên với sản phẩm có biến thể, `syncOwner` chạy ngay sau khi lưu sản phẩm trong transaction
riêng. Nếu bước này lỗi: sản phẩm đã lưu nhưng không có ảnh, media vẫn `UPLOADED` và bị job dọn
sau 24 giờ; FE báo lỗi và người dùng sửa lại. Không bọc transaction quanh luồng sản phẩm hiện có
vì đó là thay đổi hành vi ngoài phạm vi.

**Gỡ khi xoá chủ sở hữu** (A-19). `InventoryItemCrudService` override `afterDelete`
(`base-crud.service.ts:180`) để gọi `detachAll`. Các đường xoá chứng từ gọi `detachAll` tương tự.

### Luồng đọc

- **Công khai** (`PRODUCT`, `ITEM`): `url = ${MEDIA_PUBLIC_BASE_URL}/${MEDIA_BUCKET_PUBLIC}/${object_key}`,
  ghép chuỗi, không gọi storage. POS list/detail và partner search/detail gọi
  `MediaQueryService.resolvePublicUrls(ownerIds, organizationId)` (trả `{ id, url, fileName }[]` theo chủ sở hữu) **một lần cho cả trang** (`owner_id = ANY($1)`),
  theo đúng kiểu truy vấn thứ hai theo id của trang mà partner search đã dùng cho facet
  (`search-partner-products.handler.ts:335`).
- **Ảnh nhân viên**: `photoUrl` trong response `/admin/users` được tính lúc đọc bằng
  `signReadUrl` = presigned GET hạn 1 giờ, `inline`. Presign là phép ký cục bộ, không gọi mạng,
  nên tính cho cả trang danh sách được.
- **Đính kèm**: detail chứng từ trả `attachments: [{ id, fileName, contentType, size }]`, không kèm
  URL. Bấm tải về → `GET /media/:id/download-url` → presigned GET hạn 15 phút,
  `Content-Disposition: attachment` (ADR-06 quyết định ai được lấy link).

### Hạ tầng

- **Local**: MinIO trong `docker-compose.yml` (9000 API, 9001 console — M5; cổng console đổi được qua
  `MINIO_CONSOLE_PORT`), ghim tag `RELEASE` thường cuối cùng `quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z`
  (docker.io không còn repo này); tag `.hotfix` mới hơn được xem xét trước production ở T-05-02 (A-03). Vite dev server của backoffice
  proxy `/erp-media-public` và `/erp-media-private` sang `localhost:9000`, giữ nguyên path và
  header `Host`, mô phỏng nginx production (A-06). Vì vậy local dùng
  `MEDIA_PUBLIC_BASE_URL=http://localhost:3000` và trình duyệt không phải gọi khác origin.
- **Bootstrap**: `pnpm --filter @erp/api media:bootstrap` gọi `HeadBucket` → `CreateBucket` nếu thiếu;
  bucket công khai nhận `PutBucketPolicy` (ghi đè toàn bộ policy) chỉ cho phép `s3:GetObject` ẩn danh;
  bucket riêng tư được kiểm bằng `GetBucketPolicy` và bootstrap **dừng với lỗi** nếu đã có policy, không
  tự xoá. Không khởi động `AppModule`, không kết nối Postgres. Chạy lại nhiều lần không đổi kết quả (AC-18).
- **Production** (A-06, A-07): người vận hành thêm hai `location` nginx proxy nguyên path tới
  MinIO, giữ `Host`, và nâng `client_max_body_size` cho hai location này lên ít nhất 11 MB — mặc
  định của nginx là 1 MB, nên thiếu dòng này thì mọi đính kèm trên 1 MB bị 413 ở nginx trước khi tới
  MinIO. Hướng dẫn nằm trong runbook của feature, không nằm trong repo vì cấu hình nginx không có ở
  đây.
- **Biến môi trường mới**: `MEDIA_S3_ENDPOINT` (API → MinIO, nội bộ), `MEDIA_PUBLIC_BASE_URL`
  (host trình duyệt dùng; cũng là endpoint để ký), `MEDIA_S3_REGION`, `MEDIA_S3_ACCESS_KEY`,
  `MEDIA_S3_SECRET_KEY`, `MEDIA_BUCKET_PUBLIC`, `MEDIA_BUCKET_PRIVATE`. Phải thêm vào
  `apps/api/.env.example` **và** whitelist env của PM2 (`apps/api/ecosystem.config.cjs:40-68`).

## Alternatives rejected

| Option | Why not |
|---|---|
| Multipart qua API như import Excel | Chủ sở hữu chọn trình duyệt → storage (A-02). Ngoài ra fingerprint idempotency của multipart luôn là `{}` (M6) và giới hạn body 5 MB (`main.ts:56-57`) |
| SDK `minio` (npm) | Gắn code vào đúng một server đã archive; bản cuối publish 2026-02-27 (A-90). Xem ADR-01 |
| Presigned PUT | Không giới hạn được kích thước ở tầng storage; chữ ký phụ thuộc host + path. Xem ADR-02 |
| Cột `image_ids jsonb` trên `products`, cột URL trên từng bảng | Không có thứ tự, tên file, kích thước, trạng thái; mỗi chủ sở hữu một kiểu; job dọn không có chỗ tra. Xem ADR-03 |
| Bucket riêng cho mỗi tổ chức | Phải tạo bucket mỗi khi tạo tổ chức; API vẫn dùng một credential chung nên không cách ly thật. Xem ADR-04 |
| API stream mọi lần đọc | Byte file lại đi qua NestJS; `<img src>` không mang được bearer token (M6) |
| Presigned GET cho ảnh hàng hoá | URL hết hạn phá cache của POS và storefront đối tác, trái A-04 |
| Lifecycle rule của MinIO để dọn file rác | Storage không biết dòng DB nào đã gắn chủ sở hữu; dọn theo tuổi object sẽ xoá cả file hợp lệ. A-18 chọn job đọc DB |
| Endpoint tải về riêng trên từng controller chứng từ | 7 endpoint lặp lại cùng một việc; ADR-06 đạt cùng phạm vi bằng một endpoint và reader do chứng từ đăng ký |
| `MEDIA_OWNER_POLICIES` gọi thẳng service đọc của chứng từ | Module media phải import inventory và accounting, trong khi các module đó import media để gọi `syncOwner` → vòng phụ thuộc. Registry đảo chiều phụ thuộc |
| Luật "không gỡ sau ghi sổ" trong media (A-15) | Chủ sở hữu chọn A-26: theo khả năng sửa của chính chứng từ |

## Domain model

### `media_objects`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | Cũng là phần cuối của object key |
| `organization_id` | uuid not null | Mọi truy vấn lọc theo cột này |
| `owner_type` | varchar(40) not null | `PRODUCT`, `ITEM`, `EMPLOYEE_PROFILE`, `GOODS_RECEIPT`, `TRANSFER_ORDER`, `STOCK_TRANSFER`, `CASH_RECEIPT`, `CASH_PAYMENT`, `BANK_RECEIPT`, `BANK_PAYMENT` |
| `owner_id` | uuid null | `null` khi `PENDING` / `UPLOADED` |
| `status` | varchar(20) not null | `PENDING`, `UPLOADED`, `ATTACHED`, `DELETED` |
| `bucket` | varchar(63) not null | Suy từ policy, lưu lại để job dọn không phụ thuộc hằng số |
| `object_key` | varchar(300) unique | `org/<organizationId>/<owner_type viết thường>/<id>` (ADR-04) |
| `file_name` | varchar(255) not null | Tên gốc; chỉ dùng để hiển thị và `Content-Disposition`, không nằm trong key |
| `content_type` | varchar(100) not null | Khai khi xin vé; đối chiếu khi xác nhận |
| `size_bytes` | bigint not null | Khai khi xin vé; đối chiếu khi xác nhận |
| `sort_order` | int not null default 0 | Thứ tự trong chủ sở hữu |
| `created_by` | uuid not null | Chỉ người tạo được xác nhận và gắn lần đầu |
| `created_at`, `updated_at` | timestamptz | `@CreateDateColumn` / `@UpdateDateColumn` |
| `attached_at` | timestamptz null | |
| `deleted_at` | timestamptz null | Lúc chuyển sang `DELETED` |
| `object_removed_at` | timestamptz null | Lúc object thật đã bị xoá khỏi storage |

Index: `(organization_id, owner_type, owner_id, sort_order) WHERE status = 'ATTACHED'`;
`(status, created_at)` cho job dọn; unique `object_key`. Không dùng `SoftDeleteEntity`: đây là
máy trạng thái có job dọn, không phải xoá mềm để khôi phục. Migration viết tay theo quy ước
`<timestamp>-PascalName.ts` (ví dụ `1789920000000-AddStorageDefaultIssuing.ts`).

### Chuyển trạng thái

| Từ | Sự kiện | Tới |
|---|---|---|
| — | `POST /media/uploads` | `PENDING` |
| `PENDING` | xác nhận hợp lệ | `UPLOADED` |
| `PENDING` | xác nhận sai kích thước / loại / thiếu object | `DELETED`, object xoá ngay |
| `UPLOADED` | `syncOwner` | `ATTACHED` |
| `ATTACHED` | bị bỏ khỏi danh sách, hoặc chủ sở hữu bị xoá | `DELETED` |
| `PENDING`, `UPLOADED` | quá 24 giờ, job dọn | `DELETED` |
| `DELETED` với `object_removed_at` null | job dọn | đặt `object_removed_at` |

### Owner policies

| `ownerType` | Bucket | Giới hạn (A-09) | Quyền xin vé tải lên (OR) | Quyền đọc | Reader đăng ký bởi |
|---|---|---|---|---|---|
| `PRODUCT`, `ITEM` (A-08, A-25) | công khai | 2 MB; jpeg, png, gif, webp; ≤ 10 | `inventory.write` (`item-crud.service.ts:1918-1921`) | Công khai, không kiểm | — |
| `EMPLOYEE_PROFILE` | riêng tư | 5 MB; jpeg, png, webp; 1 | `iam.user.write` (`users.controller.ts:76-93`) | `iam.user.read`; hồ sơ cùng tổ chức, không có phạm vi chi nhánh (`users.controller.ts:33-34`) | — (ảnh ký sẵn trong response, không qua `download-url`) |
| `GOODS_RECEIPT` | riêng tư | 10 MB; pdf, jpeg, png, webp, xls, xlsx, doc, docx, csv; ≤ 10 | `goods_receipt.post`, `goods_receipt.write` | `goods_receipt.read` | `goods-receipt.service.ts` |
| `TRANSFER_ORDER` | riêng tư | như trên | `inventory.transfer.create` | `inventory.transfer.read` | `transfer-order.service.ts` |
| `STOCK_TRANSFER` | riêng tư | như trên | `inventory.transfer.create` | `inventory.transfer.read` | `stock-transfer.service.ts` |
| `CASH_RECEIPT` | riêng tư | như trên | `accounting.cash_receipt.create`, `accounting.cash_receipt.update` | `accounting.cash_receipt.read` | `cash-receipts.service.ts` |
| `CASH_PAYMENT` | riêng tư | như trên | `accounting.cash_payment.create`, `accounting.cash_payment.update` | `accounting.cash_payment.read` | `cash-payments.service.ts` |
| `BANK_RECEIPT` | riêng tư | như trên | `accounting.bank_receipt.create`, `accounting.bank_receipt.update` | `accounting.bank_receipt.read` | `bank-receipts.service.ts` |
| `BANK_PAYMENT` | riêng tư | như trên | `accounting.bank_payment.create`, `accounting.bank_payment.update` | `accounting.bank_payment.read` | `bank-payments.service.ts` |

Thêm và gỡ file theo đúng khả năng sửa của chủ sở hữu (A-26); bảng này không có cột quy tắc
trạng thái. Không thêm khoá quyền nào vào `permissions.seed.ts` (A-17), nên không phải sửa danh
sách cứng của e2e (`test-app.ts:135-166`).

## Contracts

### POST /media/uploads

Không có `@RequirePermission` tĩnh vì quyền phụ thuộc `ownerType` trong body; service tự kiểm.

Request (`CreateMediaUploadDto`, khai đủ mọi trường vì `forbidNonWhitelisted`):
```json
{ "ownerType": "GOODS_RECEIPT", "fileName": "hoa-don-ncc.pdf", "contentType": "application/pdf", "size": 3145728 }
```

Response 201:
```json
{
  "mediaId": "5f1c…",
  "upload": { "url": "http://erp.giaymt.com.vn/erp-media-private", "fields": { "key": "org/…/goods_receipt/5f1c…", "Content-Type": "application/pdf", "…": "các trường createPresignedPost sinh ra, FE gửi nguyên văn" } },
  "expiresAt": "2026-09-13T10:10:00.000Z"
}
```

Failure modes: 400 `MEDIA_TYPE_NOT_ALLOWED`, 400 `MEDIA_TOO_LARGE`, 403 (thiếu quyền ghi của
`ownerType`), 503 `STORAGE_UNAVAILABLE`.

### POST /media/uploads/:id/complete

Không body. Response 200:
```json
{ "mediaId": "5f1c…", "status": "UPLOADED", "fileName": "hoa-don-ncc.pdf", "contentType": "application/pdf", "size": 3145728 }
```

Gọi lại khi đã `UPLOADED` trả lại đúng response 200 (idempotent). Failure modes: 404
`MEDIA_NOT_FOUND` (khác tổ chức, hoặc không phải người tạo), 409 `MEDIA_STATE_CONFLICT` (`ATTACHED`
hoặc `DELETED`), 400 `MEDIA_INVALID`, 503 `STORAGE_UNAVAILABLE`.

### GET /media/:id/download-url

Response 200, header `Cache-Control: no-store`:
```json
{ "url": "http://erp.giaymt.com.vn/erp-media-private/org/…?X-Amz-…", "expiresAt": "2026-09-13T10:15:00.000Z" }
```

Media công khai trả URL công khai và `expiresAt: null`. Failure modes: 403 (thiếu quyền đọc của
`ownerType`), 404 `MEDIA_NOT_FOUND` (khác tổ chức, chưa `ATTACHED`, không có reader cho
`ownerType`, hoặc reader trả `false` cho actor này), 503 `STORAGE_UNAVAILABLE`.

### Bề mặt nghiệp vụ thay đổi

| Bề mặt | Request | Response |
|---|---|---|
| `POST` / `PATCH /admin/entities/inventory-items/records` (`crud.controller.ts:110-154`; body `Record<string, any>`, không DTO; FE `sanitizeCrudPayload` giữ nguyên khoá lạ — `crudPayload.ts:62,77`) | Thêm `imageIds?: string[]`. `undefined` = không đổi, `[]` = gỡ hết | — |
| `GET /admin/entities/inventory-items/records/:id` (`item-crud.service.ts:168`; nhánh sản phẩm `getRepresentativeItemForProduct` `:1472`) | — | Thêm `images: [{ id, url, fileName }]` |
| `POST` / `PATCH /admin/users` (`users.controller.ts:76-93`), `EmployeeProfileDto` (`employee-profile.dto.ts:175-179`) | Thêm `profile.photoMediaId?: string \| null`. **Bỏ** `profile.photoUrl` khỏi DTO; client duy nhất gửi trường này là backoffice (`user-form.ts:55`) | `photoUrl` giữ tên và kiểu `string \| null`, giá trị là presigned GET 1 giờ; thêm `photoMediaId`. Đổi cả 3 type ở `packages/shared-interfaces/src/iam/index.ts:56-60,189-202,240-251` |
| Create/update của 7 chứng từ — đã nhận và lưu `attachmentIds` (ví dụ `goods-receipt.service.ts:176,311-312`, `cash-receipts.service.ts:195,288`) | Giữ nguyên `attachmentIds: string[]`, nhưng từng id bắt đầu được kiểm qua `syncOwner` (hôm nay nhận UUID bất kỳ) | Detail thêm `attachments: [{ id, fileName, contentType, size }]`; `attachmentIds` giữ nguyên |
| Hai đường tạo song song phải cùng gọi `syncOwner`: phiếu nhập kho legacy `goods-receipt.service.ts:176` và v2 `create-goods-receipt-v2.handler.ts:97`; chuyển kho legacy `stock-transfer.service.ts:197,401` và v2 `stock-transfer-command-v2.controller.ts:21-24` | — | — |
| POS catalog list/detail (`pos-catalog-product.service.ts:213,651,675,703`) | — | `imageUrl` = ảnh đầu tiên của thẻ, chủ sở hữu là `PRODUCT` hoặc `ITEM` theo `COALESCE(i.product_id, i.id)` (`:480`); biến thể dùng ảnh của sản phẩm cha (A-08) |
| Partner search/detail (`search-partner-products.handler.ts:363`, `get-partner-product.handler.ts:165`) | — | `images` = URL công khai theo `sort_order` (A-10); sửa test khoá rỗng `partner-catalog-contract.spec.ts:152-156` |

Sau khi đổi endpoint: `pnpm openapi:generate`, commit `schema.ts` + `openapi.snapshot.json`.

## State ownership

| State | Owner | Lifetime |
|---|---|---|
| File đang chọn và trạng thái từng file (đang tải, xong, lỗi) | Hook `useMediaUpload(ownerType)` trong component form (`useState`) | Form đang mở |
| Id media đã `UPLOADED` | Giá trị form: `imageIds`, `profile.photoMediaId`, `attachmentIds` | Tới khi lưu |
| Xin vé và xác nhận | `useMutation` TanStack Query qua `erpApi` | Một request |
| Byte file lên storage | Hàm `uploadToStorage(upload, file)` dùng `fetch` trần | Một request |
| Link tải về đính kèm | Gọi khi bấm, không đưa vào query cache | Tức thời |
| Nút lưu | Bị khoá khi còn file đang tải | Form đang mở |

Hai hiển thị dùng chung một hook: **lưới ảnh có xem trước** (ảnh hàng hoá, ảnh nhân viên) và
**danh sách tệp** (đính kèm). Danh sách tệp thay nút bị disable ở 7 dialog đang copy-paste
(ví dụ `GoodsReceiptFormDialog.tsx:2304-2307`, `ReceiptVoucherDialog.tsx:861-867`), đặt đúng chỗ
cũ trong `generalInfo`. Code dùng chung đặt ở `apps/backoffice-web/src/components/media/` và
`apps/backoffice-web/src/lib/media/` (mới). Không đưa vào `@erp/ui` vì hook gọi API của app.

## Cache & offline

- **URL công khai bất biến**: `mediaId` không bao giờ tái dùng, thay ảnh là tạo id mới. Người vận
  hành có thể đặt `Cache-Control: public, max-age=31536000, immutable` cho location của bucket
  công khai.
- **Presigned GET không được cache**: `download-url` trả `no-store`; FE không lưu vào query cache.
- **`photoUrl` hết hạn sau 1 giờ**: màn hồ sơ nhân viên refetch khi mount (mặc định TanStack) là
  đủ. Form để mở quá 1 giờ có thể mất ảnh xem trước; chấp nhận.
- **Offline**: không hỗ trợ; backoffice vốn cần mạng.

## Observability

- Log bằng `Logger` của Nest, tiếng Anh, mỗi dòng có `requestId` (khi có), `organizationId`,
  `mediaId`, `ownerType`: `media.upload.requested`, `media.upload.completed`,
  `media.upload.rejected` (kèm lý do `size_mismatch` / `type_mismatch` / `object_missing`),
  `media.detached`, `media.cleanup` (số dòng hết hạn, số object đã xoá, số lỗi).
- **Không log** presigned URL, trường policy, credential hay tên file gốc.
- Không thêm endpoint health mới (hiện chỉ có `/health`, `/health/db` — M4); lỗi storage lộ ra
  qua 503 và log `media.*`.
- Không thêm metric riêng; `MetricsInterceptor` đã gắn nhãn theo route (M6).

## Error taxonomy

| Condition | HTTP | `code` | UI |
|---|---|---|---|
| Loại file không được phép | 400 | `MEDIA_TYPE_NOT_ALLOWED` | Lỗi ngay dưới ô chọn file; file không được tải |
| File quá dung lượng | 400 | `MEDIA_TOO_LARGE` | Như trên |
| Vượt số file của một chủ sở hữu | 400 | `MEDIA_LIMIT_EXCEEDED` | Lỗi ngay dưới ô chọn file; khi lưu thì toast lỗi |
| Người dùng giữ quá nhiều file tải lên chưa gắn (A-30) | 429 | `MEDIA_QUOTA_EXCEEDED` | Toast "Có quá nhiều tệp tải lên chưa được lưu, hãy lưu biểu mẫu rồi thử lại" |
| Object thiếu, sai kích thước hoặc sai loại lúc xác nhận | 400 | `MEDIA_INVALID` | File chuyển sang trạng thái lỗi, có nút bỏ |
| Media không tồn tại, khác tổ chức, không phải người tạo, hoặc chủ sở hữu ngoài phạm vi | 404 | `MEDIA_NOT_FOUND` | Toast lỗi |
| Xác nhận media đã gắn/đã xoá; gắn media đang thuộc chủ sở hữu khác | 409 | `MEDIA_STATE_CONFLICT` | Toast lỗi |
| Sửa đính kèm của chứng từ ở trạng thái kết thúc (A-26) | mã hiện có của endpoint sửa chứng từ | mã hiện có | Như lỗi sửa chứng từ hôm nay; ô đính kèm chỉ đọc ở trạng thái đó |
| Thiếu quyền của `ownerType` | 403 | `HTTP_403` (fallback của filter, `http-exception.filter.ts:30-36`) | Toast lỗi hiện có |
| Storage chưa cấu hình hoặc không với tới | 503 | `STORAGE_UNAVAILABLE` | Toast "Không thể tải tệp lên lúc này"; dữ liệu form giữ nguyên. **Ngoại lệ** (T-01-06, 2026-09-13): đường đọc URL ảnh công khai (catalog POS, API đối tác) không lỗi — trả không có ảnh và log cảnh báo một lần; ký link riêng tư vẫn 503 |
| Trình duyệt POST lên storage thất bại (vé hết hạn, mạng, 413 ở nginx, vượt `content-length-range`) | — | lỗi phía FE `UploadFailed` | File chuyển trạng thái lỗi, nút "Thử lại" xin vé mới |

## ADRs

### ADR-01 — Chỉ dùng S3 API chuẩn qua AWS SDK v3, không dùng SDK `minio`
**Context:** MinIO community đã archive, chủ sở hữu vẫn chọn nó (A-03). Nếu sau này đổi sang
S3-compatible khác, code không được phải viết lại. SDK `minio` bản cuối publish 2026-02-27;
`@aws-sdk/client-s3`, `@aws-sdk/s3-presigned-post`, `@aws-sdk/s3-request-presigner` publish
2026-09-11.
**Decision:** `ObjectStorageService` chỉ dùng `@aws-sdk/client-s3` (`HeadObject`, `DeleteObject`,
`HeadBucket`, `CreateBucket`, `PutBucketPolicy`, `GetBucketPolicy`), `@aws-sdk/s3-presigned-post` và `@aws-sdk/s3-request-presigner`,
với `forcePathStyle: true`. Hai client: một trỏ `MEDIA_S3_ENDPOINT` để gọi thật, một trỏ
`MEDIA_PUBLIC_BASE_URL` chỉ để ký (không gọi mạng). Không import `minio`; kiểm bằng grep trong
DoD.
**Consequences:** Đổi engine là đổi biến môi trường. Không dùng được tính năng quản trị riêng
của MinIO từ code; việc gì cần `mc` thì nằm trong runbook. Dependency AWS SDK nặng hơn SDK `minio`.
**Status:** accepted

### ADR-02 — Presigned POST có policy thay cho presigned PUT
**Context:** A-02 chốt hướng đi trình duyệt → storage, ban đầu mô tả bằng presigned PUT. Presigned
PUT không giới hạn được kích thước ở tầng storage: người có vé đổ được file rất lớn lên MinIO
trước khi bước xác nhận kịp xoá, mà MinIO dự kiến chung đĩa với Postgres (A-07). Chữ ký PUT còn
phụ thuộc host và path mà nginx phải giữ nguyên (A-06).
**Decision:** Dùng `createPresignedPost` với điều kiện `content-length-range` [1, kích thước đã khai]
(kích thước đã khai không vượt giới hạn của `ownerType`; siết từ [1, giới hạn] sau security review T-01-04 để vé
không dùng lại được cho file lớn hơn — A-29), `Content-Type` bằng đúng giá trị đã khai, `key` cố định, hạn 10 phút. Bước xác nhận
vẫn `HeadObject` để đối chiếu, vì client có thể khai sai rồi gửi đúng trong giới hạn.
**Consequences:** Storage từ chối file quá cỡ ngay khi nhận. Chữ ký nằm trên policy, không trên
host/path, nên đường **ghi** bớt phụ thuộc cấu hình nginx; đường **đọc** riêng tư vẫn là presigned
GET và vẫn cần A-06. FE gửi `multipart/form-data` tới storage thay vì PUT thân file. Mô tả của
A-02 đã được sửa thành presigned POST ngày 2026-09-13; hướng đi mà chủ sở hữu chọn không đổi.
**Status:** accepted

### ADR-03 — Một bảng `media_objects` là nguồn sự thật; `attachment_ids` giữ làm bản sao
**Context:** Ba loại chủ sở hữu có ba hình dạng khác nhau (M11 mục 3); ảnh hàng hoá cần thứ tự
và metadata; job dọn cần một chỗ để tra trạng thái. 7 bảng chứng từ đã có `attachment_ids jsonb`
nằm trong DTO công khai và được FE khai kiểu.
**Decision:** Mọi file là một dòng `media_objects` có `owner_type` + `owner_id`. Với chứng từ,
`syncOwner` trả mảng id đã sắp xếp và service chứng từ ghi lại vào `attachment_ids` **trong cùng
transaction**, để hợp đồng hiện có không đổi. Không thêm cột vào `products`, `items`,
`employee_profiles`.
**Consequences:** Có hai nơi lưu danh sách đính kèm; `syncOwner` là đường ghi duy nhất nên hai nơi
không lệch nhau trong code của feature này, nhưng một đường ghi thẳng `attachment_ids` ở chỗ khác
sẽ làm lệch. `employee_profiles.photo_url` thôi được ghi và thành cột chết, không xoá trong v1.
**Status:** accepted

### ADR-04 — Hai bucket theo mức hiển thị, key mang tổ chức
**Context:** A-04 và A-05: ảnh hàng hoá công khai, ảnh nhân viên và đính kèm riêng tư. Dữ liệu
nhiều tổ chức nằm chung một storage.
**Decision:** Bucket `MEDIA_BUCKET_PUBLIC` có policy `s3:GetObject` ẩn danh; bucket
`MEDIA_BUCKET_PRIVATE` không có policy ẩn danh. Key `org/<organizationId>/<owner_type>/<mediaId>`,
không chứa tên file gốc. Cách ly tổ chức thực hiện ở API (mọi truy vấn lọc `organization_id`),
không ở storage.
**Consequences:** Một lỗi policy trên bucket công khai không lộ file riêng tư. `mediaId` là UUID
v4 nên URL công khai không đoán được, nhưng một URL đã lộ thì dùng được tới khi ảnh bị gỡ. nginx
cần hai `location` (A-06).
**Status:** accepted

### ADR-05 — Gỡ media bằng cách đánh dấu trong transaction, xoá object sau commit, job dọn phần còn lại
**Context:** DB và storage không chung transaction. Xoá object trước commit mà transaction
rollback thì mất file của bản ghi vẫn còn; xoá sau commit mà tiến trình chết thì còn object rác.
**Decision:** Trong transaction nghiệp vụ chỉ đổi `status = DELETED` và `deleted_at`. Sau commit
xoá object theo kiểu best-effort và đặt `object_removed_at`. `MediaCleanupJob` hằng ngày: chuyển
`PENDING`/`UPLOADED` quá 24 giờ sang `DELETED` (A-18), rồi xoá mọi object `DELETED` chưa có
`object_removed_at`.
**Consequences:** Object bị gỡ có thể còn trong storage tới một ngày; với bucket công khai, URL
của ảnh vừa gỡ vẫn mở được tới khi job hoặc bước sau commit chạy xong. Job chạy một lần mỗi
deployment vì API chạy một tiến trình PM2 (M8).
**Status:** accepted

### ADR-06 — Ai được lấy link file = ai được xem chủ sở hữu, kiểm bằng reader do chủ sở hữu đăng ký
**Context:** Phạm vi chi nhánh không đồng đều giữa các controller chứng từ: phiếu thu/chi gắn ở
cấp class, còn `GET`/`PATCH` của lệnh chuyển kho và chuyển kho không có decorator. Viết lại luật
phạm vi trong module media sẽ tạo luật thứ hai, có thể lệch với màn xem chứng từ. Gọi thẳng
service chứng từ từ module media lại tạo vòng import.
**Decision:** `download-url` kiểm quyền đọc của `ownerType` bằng `RbacService.hasAnyPermission`,
rồi hỏi `MediaOwnerReaderRegistry`. Mỗi service chứng từ đăng ký một reader trong `onModuleInit`,
reader dùng đúng hàm đọc mà endpoint detail của nó dùng, với cùng `actor`. Không có reader, hoặc
reader trả `false` → 404. Ảnh nhân viên không đi qua endpoint này; `photoUrl` được ký sẵn trong
response `/admin/users`, vốn đã được bảo vệ bởi `iam.user.read`.
**Consequences:** Ai xem được chứng từ thì tải được đính kèm, và ngược lại — không ai phải nhớ hai
bộ luật. Lỗ hổng phạm vi của màn xem chứng từ (nếu có) cũng là lỗ hổng của tải file; sửa phạm vi
chứng từ là việc ngoài feature này. Quên đăng ký reader thì tải về luôn 404, lộ ra ngay ở test,
không lộ file.
**Status:** accepted
