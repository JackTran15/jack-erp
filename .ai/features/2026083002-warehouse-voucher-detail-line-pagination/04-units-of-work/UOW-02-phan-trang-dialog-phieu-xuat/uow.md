---
id: UOW-02
slug: phan-trang-dialog-phieu-xuat
title: Dialog xem chi tiết phiếu xuất chỉ tải một trang dòng
demoable: true
duration: 1.5d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-05, AC-06, AC-07]
risk: medium
status: todo
rollback: hoàn tác các commit phía web đưa lưới về đọc `initial.lines`. Query param `includeLines` mặc định `true` nên phần API để lại cũng vô hại nếu chỉ hoàn tác phía web.
---

# UOW-02 — Dialog xem chi tiết phiếu xuất chỉ tải một trang dòng

## Demo script

1. Mở danh sách phiếu xuất kho, chọn một phiếu có ít nhất 200 dòng.
2. Mở tab Network của trình duyệt, xoá sạch, rồi bấm số phiếu để mở dialog xem chi tiết.
3. Đối chiếu trong Network: request `GET /:id` **không** kèm mảng dòng, và có đúng một
   request `GET /:id/lines` mang `page` và `pageSize`.
4. Lưới hiện một trang dòng, thanh phân trang hiện tổng số dòng thật của phiếu.
5. Bấm sang trang 2, trang 3 → dòng đổi, không trùng không sót, thứ tự liền mạch.
6. Mở một phiếu chỉ có 3 dòng → cả 3 dòng trên một trang, không mời sang trang không có.
7. Mở cùng phiếu đó ở chế độ **sửa** → lưới hiện đủ mọi dòng, không cắt trang, lưu bình thường.

## In scope

- Query param `includeLines` trên hai endpoint chi tiết, mặc định `true`.
- Lưới dòng chế độ xem của `GoodsIssueFormDialog` đọc từ `/:id/lines` qua TanStack Query.
- Chặn mọi effect đang bám vào `lines` khi ở chế độ xem.
- Nối đường mở dialog ở `GoodsIssuePage` sang `includeLines=false`.

## Not in scope

- Dialog phiếu nhập — UOW-03.
- Chế độ tạo và chế độ sửa (ADR-04).
- Tìm kiếm, lọc hay sắp xếp theo cột trên lưới dòng.

## Risks

| Risk | Mitigation |
| --- | --- |
| Các effect giải kệ ưu tiên và đoán kho (`GoodsIssueFormDialog.tsx:239-320`) chạy trên một trang dòng và ghi đè dữ liệu đã lưu | Chặn từng effect bằng `isView`; T-02-02 liệt kê từng effect đã chặn trong done-when |
| `lines` vắng mặt thay vì mảng rỗng làm vỡ chỗ khác trong dialog | ADR-03 nêu rõ; T-02-02 xử lý trường không tồn tại |
| Đổi chữ ký `GET /:id` làm hỏng đường gom mã vạch | Mặc định `true`, không caller nào phải sửa; T-02-01 khẳng định bằng test |

## Definition of done

- [x] AC-05, AC-06, AC-07 pass
- [x] `openapi:generate` đã chạy, snapshot và `schema.ts` đã tái sinh. **Chưa commit** — toàn bộ feature còn trong working tree (HEAD `0a9d54bb`, 45 tệp); commit là bước giao hàng của Akenzy, không phải của lát cắt này
- [x] Chế độ tạo/sửa không đổi hành vi — kiểm tay ở T-03-02 (tạo→lưu→mở lại; sửa thêm/sửa/xoá→lưu→mở lại) và T-06-05 (lọc tại chỗ, 0 request)
- [x] Thay ảnh chụp bằng **số đo A/B định lượng** ở T-03-03: đường cũ 42,2 ms / 205.803 B, đường mới 57,3 ms / 86.337 B, cộng đường cong `limit` 1/10/50/120 để suy điểm hoà vốn. Một ảnh chụp tab Network không nói được điều đó
- [x] Demoed và được chấp nhận ở gate G4 — Akenzy, 2026-09-03
