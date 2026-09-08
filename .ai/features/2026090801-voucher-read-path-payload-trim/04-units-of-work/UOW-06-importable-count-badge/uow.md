---
id: UOW-06
slug: importable-count-badge
title: Badge điều chuyển đọc từ endpoint đếm
demoable: true
duration: 1d
depends_on: []
requirements: [US-06]
verifies: [AC-20, AC-21, AC-22]
risk: low
status: todo
rollback: revert commit; route mới không có consumer nào khác nên bỏ đi là đủ
---

# UOW-06 — Badge điều chuyển đọc từ endpoint đếm

Lát cắt nhỏ nhưng chạm **mọi trang** của backoffice: `useImportableTransferOrderCount` mount
trong `AppSidebar` (`:42`), `MegaMenuPanel` (`:43`) và `InventoryTabBar` (`inventoryTabs.tsx:23`).
Ba chỗ dùng chung một query key nên TanStack gộp thành một request — nhưng request đó chạy trên
mọi trang, kể cả khi người dùng không bao giờ mở tab điều chuyển.

Giá nằm ở **server**, không ở payload: `listImportable` (`transfer-order.service.ts:637-690`) nạp
các phiếu xuất bản gốc chỉ để cộng `lineTotal`, mà `GoodsIssueEntity.lines` là `eager: true` và
mỗi dòng lại eager `item` + `location`. Trên bản restore prod, chi nhánh nặng nhất kéo **163
dòng phiếu xuất** để in ra chữ số `5`.

## Demo script
1. Đăng nhập bằng tài khoản có `inventory.transfer.read`, mở **Bán hàng** (một trang bất kỳ
   ngoài Điều chuyển từ cửa hàng khác)
2. Network: chỉ thấy `GET /inventory/transfer-orders/importable/count` trả `{ "count": N }`
3. Bật log truy vấn của API: không có truy vấn nào chạm `goods_issues` / `goods_issue_lines`
4. Mở tab Điều chuyển từ cửa hàng khác, đếm số hàng → bằng đúng N
5. Đăng nhập bằng tài khoản **không** có `inventory.transfer.read` → không có request nào tới
   endpoint đếm, không có 403 nào trong Network

## In scope
- `buildImportableWhere` dùng chung + `countImportable`
- Route `GET /inventory/transfer-orders/importable/count`
- `useImportableTransferOrderCount` đổi nguồn + gate quyền

## Not in scope
- Thay đổi `/importable` (A-06 — giữ nguyên, kể cả `lines`)
- Trang Điều chuyển từ cửa hàng khác

## Risks
| Risk | Mitigation |
| --- | --- |
| Vị từ bị chép ra hai nơi rồi lệch nhau → badge và danh sách nói hai số | ADR-06: một hàm `buildImportableWhere` dùng chung; AC-20 so hai con số trong cùng một lượt |
| Route bị `@Get(":id")` nuốt thành id | Đặt trước `@Get(":id")`; đúng cái bẫy đã ghi ở `branch.controller.ts:112` |


## Bằng chứng trình duyệt — G4

Chuyển xuống đây ngày 8/9/2026 (reopen G3). Trước đó chúng nằm trong done-when của ticket,
khiến ticket không bao giờ `submit` được vì agent CLI không có trình duyệt. Chúng là bằng
chứng mức demo và thuộc về gate G4.

- [x] ~~*(từ T-06-02)* Tài khoản thiếu `inventory.transfer.read`: **không** có request nào tới endpoint đếm, và~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
      không có 403 trong Network (AC-22) — **CHƯA CHỨNG MINH.** Cần một tài khoản thứ hai không có
      quyền đó; môi trường hiện tại không có. Không thay bằng phép kiểm yếu hơn, không sửa lời AC
      cho dễ qua
- [x] ~~*(từ T-06-02)* Sau khi nhập một lệnh điều chuyển, badge giảm đi 1 — **CHƯA CHỨNG MINH.** Đòi thực hiện một~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
      nghiệp vụ **ghi** trên dữ liệu thật của người dùng; không tự làm
## Definition of done
- [x] ~~AC-20..AC-22 pass~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
- [x] ~~`openapi.snapshot.json` + `schema.ts` regenerate và commit~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
- [x] ~~Mọi mục trong "Bằng chứng trình duyệt — G4" ở trên đã được kiểm~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
- [x] ~~Demoed và được chấp nhận ở gate G4~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
