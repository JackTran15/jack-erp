# TKT-KM-10 Voucher — mở rộng entity + search v2 + CRUD

## Epic

[EPIC-22072026 Khuyến mại — schema chuẩn hóa, domain engine & evaluate API](../epics/EPIC-22072026-promotion-programs-engine.md)

## Summary

Màn "Thẻ voucher" (FR-050, FR-051) của backoffice đang chạy trên `_mock/mock-vouchers.ts`. Bảng `vouchers` đã tồn tại nhưng **thiếu 3 trường** mà FE cần (`issuer`, `description`, `status`) và **không có** 3 cột tổng hợp. Ticket này bù phần thiếu và cấp API thật.

Khác với promotion programs, voucher **không** cần clean architecture — nó là CRUD phẳng một bảng. Giữ ở tầng service như phần còn lại của repo; chỉ search dùng CQRS vì cần lọc theo cột.

## Deliverables

- `apps/api/src/database/migrations/<ts>-ExtendVouchers.ts` — `ALTER TABLE "vouchers"`:
  - `ADD COLUMN "issuer" varchar NULL` (FR-051 đánh dấu bắt buộc ở form, nhưng cột phải nullable để dữ liệu cũ không vỡ; ràng buộc bắt buộc đặt ở DTO)
  - `ADD COLUMN "description" text NULL`
  - `ADD COLUMN "status" "promotion_status_enum" NOT NULL DEFAULT 'TRACKING'` — dùng lại enum của TKT-KM-02
  - `ALTER COLUMN "valid_from" DROP NOT NULL`, `ALTER COLUMN "valid_to" DROP NOT NULL` — FR-051: *"Bỏ trống từ ngày, đến ngày nếu không giới hạn thời gian"*
- `apps/api/src/modules/promotion/voucher.entity.ts` — thêm 3 cột, đổi `validFrom`/`validTo` thành optional.
- `apps/api/src/modules/promotion/application/queries/search-vouchers-v2.{query,handler}.ts`
- `apps/api/src/modules/promotion/application/dto/voucher-search-v2.dto.ts`
- `apps/api/src/modules/promotion/interface/voucher-v2.controller.ts`
- Mở rộng `CreateVoucherDto` (`dto/create-voucher.dto.ts`) với `issuer` (bắt buộc), `description`, và cho phép `validFrom`/`validTo` optional.

| Method | Route | Xử lý | Permission |
| ------ | ----- | ----- | ---------- |
| POST | `/v2/vouchers/search` | `SearchVouchersV2Query` | `promotion.read` |
| POST | `/v2/vouchers` | `VoucherService.create` | `promotion.write` |
| PUT | `/v2/vouchers/:id` | `VoucherService.update` | `promotion.write` |
| POST | `/v2/vouchers/:id/duplicate` | `VoucherService.duplicate` | `promotion.write` |
| DELETE | `/v2/vouchers/:id` | soft/deactivate | `promotion.delete` |

## Acceptance Criteria

- [ ] Migration chạy trên DB đang có dữ liệu; voucher cũ (nếu có) vẫn đọc được, `status` mặc định `TRACKING`.
- [ ] `validFrom`/`validTo` null = vô thời hạn; `VoucherService.validate` (đang dùng bởi `PromotionApplyService`) **vẫn hoạt động** với giá trị null — kiểm tra kỹ, hiện nó so sánh trực tiếp không kiểm null.
- [ ] `POST /v2/vouchers/search` trả đủ 10 cột FR-050: `issuer`, `code`, `startDate`, `endDate`, `description`, `faceValue`, `totalQuantity`, `totalVoucherValue`, `totalAppliedValue`, `status`.
- [ ] **3 cột tổng hợp tính trong RAM**, không GROUP BY:
  - `totalQuantity` = số voucher cùng `code` (nếu phát hành theo lô) — với mô hình 1 dòng = 1 voucher thì luôn là 1
  - `totalVoucherValue` = `faceValue × totalQuantity`
  - `totalAppliedValue` = tổng `faceValue` của các voucher đã dùng (`isUsed = true`)
  Lấy raw rows rồi tính bằng JS — quy ước đã chốt của repo cho view tổng hợp.
- [ ] Có **dòng tổng cộng** cho các cột số: response kèm `summary: { totalQuantity, totalVoucherValue, totalAppliedValue }` tính trên **toàn tập kết quả lọc**, không phải chỉ trang hiện tại.
- [ ] Filter theo cột dùng sub-DTO có sẵn: `issuer`/`code`/`description` → `StringFilterDto`; `startDate`/`endDate` → `DateRangeFilterDto`; `status` → `EnumFilterDto`; `faceValue` → `CompareFilterDto`.
- [ ] `code` unique theo org (ràng buộc `uq_voucher_org_code` đã có) — trùng mã → 409 `ConflictException`, không phải 500.
- [ ] Mọi truy vấn lọc `actor.organizationId`.
- [ ] `duplicate` copy mọi trường trừ `code` (client phải nhập mã mới), `id`, `isUsed`, `redeemedInvoiceId`.

## Definition of Done

- [ ] `pnpm --filter @erp/api test -- voucher` và `lint` xanh.
- [ ] `voucher.service.spec.ts` hiện có vẫn xanh sau khi đổi `validFrom`/`validTo` thành optional.
- [ ] Migration `revert` sạch (drop 3 cột, khôi phục NOT NULL — chỉ khả thi nếu không có dòng null; ghi rõ trong comment `down()`).
- [ ] Không có tiếng Việt trong source backend.

## Tech Approach

Không đụng `PromotionApplyService` và luồng apply voucher hiện tại — chúng thuộc lớp legacy, epic POS sẽ xử lý. Ticket này chỉ mở rộng dữ liệu + cấp API đọc/ghi cho backoffice.

Điểm cần cẩn thận: `VoucherService.validate(code, customerId, actor)` hiện so sánh `validFrom`/`validTo` không kiểm null. Sau khi cột thành nullable, phải sửa thành:

```ts
const now = new Date();
if (voucher.validFrom && voucher.validFrom > now) throw new BadRequestException('Voucher is not yet valid');
if (voucher.validTo   && voucher.validTo   < now) throw new BadRequestException('Voucher has expired');
```

Đây là sửa **bắt buộc**, không phải drive-by refactor — bỏ qua sẽ khiến voucher vô thời hạn bị từ chối.

`status` dùng lại `promotion_status_enum` thay vì tạo enum riêng: FR-050 nói bộ lọc trạng thái của màn voucher cũng là `Đang theo dõi` / `Ngừng theo dõi`, cùng ngữ nghĩa.

## Testing Strategy

- Unit: `SearchVouchersV2Handler` với repository mock — kiểm 3 cột tổng hợp và `summary` toàn tập.
- Unit: `VoucherService.validate` với `validFrom`/`validTo` null → hợp lệ.
- E2E (TKT-KM-16): tạo voucher → search thấy → sửa → xóa.

## Dependencies

- Depends on: TKT-KM-02 (dùng lại `promotion_status_enum`)
- Blocks: TKT-KM-11
