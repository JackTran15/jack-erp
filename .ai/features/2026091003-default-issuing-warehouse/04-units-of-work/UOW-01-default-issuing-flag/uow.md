---
id: UOW-01
slug: default-issuing-flag
title: Quản lý chi nhánh tick được "Kho xuất hàng mặc định"
demoable: true
duration: 2d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06]
risk: medium
status: todo
rollback: migration có `down` đầy đủ (drop index rồi drop column); revert code kèm `pnpm migration:revert`
---

# UOW-01 — Quản lý chi nhánh tick được "Kho xuất hàng mặc định"

Lát cắt này nhân bản nguyên khuôn `isDefaultReceiving` đang chạy trong repo. Mọi quyết định
kỹ thuật đã có tiền lệ; điểm **duy nhất** đi chệch bản gốc là điều kiện backfill (ADR-04).

## Demo script

1. Đăng nhập backoffice bằng tài khoản có quyền `inventory.write`, chọn một chi nhánh có ít
   nhất hai kho lưu trữ.
2. Vào Danh mục > Kho hàng, mở kho A → thấy checkbox mới "Kho xuất hàng mặc định".
3. Tick rồi lưu → mở lại kho A, checkbox đã tick và bị khoá, kèm dòng giải thích cách đổi.
4. Mở kho B, tick "Kho xuất hàng mặc định", lưu.
5. Mở lại kho A → checkbox đã tự bỏ tick. Chi nhánh chỉ có một kho xuất mặc định.
6. Ở kho B, thử tick "Ngừng hoạt động" → checkbox không hiện (bị `cannotDeactivate` ẩn); gọi
   thẳng API để ngừng hoạt động → nhận lỗi tiếng Việt yêu cầu đặt kho khác trước.
7. Gửi `PATCH admin/entities/inventory-storages/records/<id kho A>` với
   `isDefaultIssuing: true` → 200, nhưng kho A vẫn không phải kho xuất mặc định.
8. Tick "Kho nhập hàng mặc định" cho chính kho B → cả hai cờ cùng bật, không lỗi.

## In scope

- Cột `is_default_issuing`, backfill, partial unique index theo chi nhánh.
- `SetDefaultIssuingWarehouseCommand` + handler + endpoint `v2`.
- Chốt strip PATCH chung và chốt ngừng hoạt động.
- Trường trong CRUD config, bộ lọc Có/Không, checkbox trong dialog.

## Not in scope

- Mọi thứ liên quan tới POS — UOW-02 và UOW-03.
- Bỏ tick cờ mà không chuyển sang kho khác: bản `isDefaultReceiving` cũng không hỗ trợ
  (checkbox bị `disabled` khi đang là mặc định, `CrudRecordDialog.tsx:554`), và feature này
  giữ đúng hành vi đó.
- Chặn đặt cờ lên kho đang ngừng hoạt động: bản `isDefaultReceiving` cũng không chặn; sửa ở
  đây là sửa mã lân cận ngoài phạm vi. Ghi nhận là nợ đã biết.

## Risks

| Risk | Mitigation |
| --- | --- |
| Backfill chép y hệt bản kho nhập sẽ gán cờ cho kho backing showroom, thứ POS không bao giờ thấy (ADR-04) | T-01-01 ghi rõ điều kiện `is_main_storage = false AND is_active = true`, và done-when bắt diễn tập chỉ-đọc câu backfill |
| PATCH chung làm vỡ partial unique index → 500 thay vì lỗi nghiệp vụ | T-01-03 có test cho đúng tình huống này (AC-04) |
| Chiều cao dialog hardcode theo chế độ (`CrudRecordDialog.tsx:428-441`), thêm checkbox là tràn | T-01-04 chỉnh cùng lúc và kiểm bằng mắt ở 1440x900 |

## Definition of done

- [ ] AC-01 đến AC-06 pass
- [ ] Migration chạy được xuôi và ngược (`pnpm migration:run`, `pnpm migration:revert`)
- [ ] Backfill đã diễn tập chỉ-đọc trên `erp_dev_3008` (`erp_clone_prod` không còn trên :5433) và số kho sẽ được gán khớp số chi nhánh có kho lưu trữ thật đang hoạt động
- [ ] `pnpm --filter @erp/api test` xanh
- [ ] `pnpm openapi:generate` đã chạy, snapshot và schema sinh ra được commit
- [ ] Demo script chạy được đầu-cuối và được nghiệm thu ở G4
