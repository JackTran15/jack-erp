---
id: UOW-08
slug: pivot-branch-columns-pushdown
title: Bảng pivot lọc được theo cột chi nhánh động
demoable: true
duration: 1.5d
depends_on: [UOW-07]
requirements: [US-02]
verifies: [AC-02, AC-04, AC-18]
risk: medium
status: todo
rollback: revert phần specs động; cột chi nhánh quay lại trả 400 như cuối UOW-07
---

# UOW-08 — Bảng pivot lọc được theo cột chi nhánh động

## Demo script

1. Mở bảng pivot, lọc cột của một chi nhánh cụ thể lớn hơn 0
2. → chỉ còn mặt hàng có tồn ở chi nhánh đó; tổng số dòng và footer đổi theo
3. Sang trang 2 → vẫn đúng bộ lọc, không có dòng nào lọt lưới
4. Lọc hai cột chi nhánh cùng lúc → hai vị từ AND với nhau

## In scope

- Sinh spec động cho `branch.qty.<branchId>` theo đúng các khoá có trong request (A-07)
- Truy vấn con tương quan trên `stock_balances` ghép vào `itemPageSql`, `itemCountSql` và `loadBranchTotals`

## Not in scope

- Cho phép lọc theo giá trị (value) của ô chi nhánh — catalog chỉ phát khoá `qty`

## Risks

| Risk | Mitigation |
|---|---|
| Khoá cột do người gọi gửi lên và được dùng để sinh SQL | `branchQtyColumnKey` chỉ tách ra UUID; UUID được kiểm dạng rồi truyền làm **tham số vị trí**, không nội suy vào chuỗi SQL |

## Definition of done

- [x] AC-18 xanh, AC-02 footer khớp khi lọc cột chi nhánh
- [x] AC-04 parity với đường JS trên tổ chức nhỏ
- [x] `pnpm --filter @erp/api test` xanh
- [ ] Demo được nghiệm thu ở gate G4
