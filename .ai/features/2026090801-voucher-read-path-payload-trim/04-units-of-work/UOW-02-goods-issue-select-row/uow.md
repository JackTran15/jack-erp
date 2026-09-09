---
id: UOW-02
slug: goods-issue-select-row
title: Xuất kho — cùng hành vi với Nhập kho
demoable: true
duration: 1d
depends_on: []
requirements: [US-02]
verifies: [AC-05, AC-06]
risk: low
status: todo
rollback: revert 1 commit phía backoffice-web
---

# UOW-02 — Xuất kho: cùng hành vi với Nhập kho

`GoodsIssuePage.tsx:353-360` có **đúng** cùng một lỗi với `PurchaseOrdersPage.tsx:394`, và cùng
đã có sẵn `POST /v2/inventory/goods-issues/:id/lines/search`. Không phụ thuộc UOW-01 (không có
ràng buộc dữ liệu hay hợp đồng nào giữa hai trang), nhưng nếu làm tuần tự thì làm sau để dùng
lại đúng hình dạng đã chốt ở T-01-02.

Quy mô nhỏ hơn hẳn Nhập kho: trung bình 15,1 dòng/phiếu, max 128 (so với 259,6 / 5 000). Lợi
ích tuyệt đối vì thế nhỏ hơn — lý do làm vẫn là **không để lại đúng cái lỗi vừa sửa ở trang bên cạnh**.

## Demo script
1. Vào **Kho > Xuất kho**, mở DevTools > Network
2. Chọn một phiếu xuất nhiều dòng → chỉ một request `GET /inventory/goods-issues/:id?includeLines=false`,
   Preview không có `lines`
3. Panel/dialog phía dưới vẫn hiện dòng đầy đủ
4. Bấm nút cần cả mảng dòng → nút khoá, mở ra đủ dòng
5. Ngắt mạng, bấm lại → toast lỗi, không mở dialog

## In scope
- `GoodsIssuePage.tsx`: query chọn-dòng và các nút cần dòng

## Not in scope
- Panel cuộn vô hạn `:918` — đã phân trang từ `2026083002`
- API

## Risks
| Risk | Mitigation |
| --- | --- |
| Dialog Xuất kho có các effect bám vào `lines` (giải kệ ưu tiên, đoán kho, `GoodsIssueFormDialog.tsx:239-320`) | Chúng đã bị chặn bằng `isView` từ feature trước; T-02-02 kiểm lại chứ không giả định |


## Bằng chứng trình duyệt — G4

Chuyển xuống đây ngày 8/9/2026 (reopen G3). Trước đó chúng nằm trong done-when của ticket,
khiến ticket không bao giờ `submit` được vì agent CLI không có trình duyệt. Chúng là bằng
chứng mức demo và thuộc về gate G4.

- [x] ~~*(từ T-02-02)* Mỗi nút đó mở ra với đủ dòng; nút khoá trong lúc chờ (AC-06)~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
- [x] ~~*(từ T-02-02)* Mở dialog Xem một phiếu đã lưu: dữ liệu hiển thị khớp dữ liệu đã lưu (không bị effect ghi đè)~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
## Definition of done
- [x] ~~AC-05, AC-06 pass~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
- [x] Không còn chỗ nào đọc `lines` từ kết quả query chọn-dòng — grep 8/9, cùng hình dạng Nhập kho
- [x] ~~Mọi mục trong "Bằng chứng trình duyệt — G4" ở trên đã được kiểm~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
- [x] ~~Demoed và được chấp nhận ở gate G4~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
