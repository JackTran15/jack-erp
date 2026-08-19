---
id: UOW-06
slug: frontend-edit
title: Nút Sửa hoạt động trên màn hình Nhập kho và Xuất kho
demoable: true
duration: 1d
depends_on: [UOW-01, UOW-04]
requirements: [US-05]
verifies: [AC-19, AC-20, AC-21]
risk: low
status: todo
rollback: Trả điều kiện `status !== "DRAFT"` về chỗ cũ trên hai thanh công cụ; backend không đổi
---

# UOW-06 — Nút Sửa hoạt động trên hai màn hình

Lát cắt làm cho toàn bộ phần backend phía trên chạm được tới người dùng thật. Đây cũng là lát
duy nhất demo được mà không cần công cụ API.

## Demo script
1. Vào Nhập kho, chọn một phiếu đã ghi sổ, bấm Sửa — form mở ra với đầy đủ dòng hàng
2. Đổi số lượng một dòng, bấm Lưu → thông báo thành công, danh sách vẫn đúng một phiếu, số phiếu không đổi
3. Mở lại phiếu: dữ liệu mới; mở sổ kho mặt hàng: có dòng chênh lệch
4. Làm y hệt trên màn hình Xuất kho
5. Thử sửa một phiếu nhập tiền mặt vượt số dư quỹ → thông báo lỗi tiếng Việt nêu đúng nguyên nhân,
   phiếu giữ nguyên

## In scope
- Bật nút Sửa cho phiếu đã ghi sổ trên cả hai trang
- Payload PATCH đúng DTO cho phiếu nhập; nhánh lưu ở chế độ sửa cho phiếu xuất
- Sinh lại api-client và ảnh chụp OpenAPI
- Thông báo lỗi tiếng Việt và làm mới dữ liệu sau khi lưu

## Not in scope
- Hiển thị lịch sử sửa (đã bỏ theo A-13); `revision` chỉ dùng nội bộ
- Màn hình lệnh điều chuyển

## Risks
| Risk | Mitigation |
|---|---|
| Dialog phiếu xuất ở chế độ sửa đang tạo phiếu trùng | T-06-02 sửa đúng nhánh đó và có bước demo khẳng định danh sách không mọc thêm phiếu |
| Sinh lại api-client kéo theo thay đổi lớn ngoài phạm vi | Chỉ commit phần schema liên quan hai endpoint; không sửa tay file sinh tự động |

## Definition of done
- [x] AC-19, AC-20, AC-21 pass — click-through thật qua `verify.py --write` (21/21 bước xanh,
      `evidence_check.py` OK), xem `07-verification.md` S1-S21
- [x] Sửa xong danh sách và bản in đều hiện dữ liệu mới, số phiếu không đổi — xác nhận qua
      S2-S21: số phiếu (VD IMP000012, XK000004) giữ nguyên qua nhiều lần sửa, danh sách hiện
      đúng giá trị mới sau mỗi lần Lưu
- [x] Không có phiếu trùng nào được tạo trong toàn bộ kịch bản demo — S15 (AC-20) xác nhận PATCH
      không sinh POST mới; mọi bước xoá xác nhận qua `no-text=<marker>` sau khi tải lại danh sách
- [x] `pnpm build` của backoffice-web xanh
- [ ] Demoed và được chấp nhận ở G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
- [ ] PR draft copied and contact sheets attached to the PR description
