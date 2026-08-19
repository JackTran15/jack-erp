---
id: UOW-04
slug: issue-edit-delete
title: Sửa và xoá phiếu xuất kho với giá vốn đúng
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-03]
verifies: [AC-12, AC-13, AC-14]
risk: medium
status: todo
rollback: Endpoint PATCH của phiếu xuất là endpoint mới — gỡ route là quay về nguyên trạng; `cancel()` giữ nhánh cũ sau một cờ điều kiện
---

# UOW-04 — Sửa và xoá phiếu xuất kho

Phiếu xuất không có bút toán kế toán (hiện trạng, ngoài phạm vi feature này), nên lát cắt này
chỉ phải làm đúng hai việc: chênh lệch số lượng và chênh lệch giá vốn.

## Demo script
1. Tạo phiếu xuất PXK-A: 1 dòng 5 cái; ghi lại đơn giá vốn hệ thống chốt cho phiếu
2. Nhập thêm hàng giá cao hơn để giá bình quân của mặt hàng tăng lên
3. Sửa PXK-A thành 8 cái → sổ kho có dòng −3 theo giá bình quân **mới**, 5 cái cũ giữ giá cũ
4. Sửa PXK-A xuống 2 cái → sổ kho có dòng +6 theo đúng đơn giá đã ghi của phiếu
5. Xoá phiếu → toàn bộ số lượng cộng lại, phiếu biến khỏi danh sách
6. Bấm Xoá hai lần thật nhanh: chỉ một lần có tác dụng

## In scope
- `GoodsIssueService.update()` + endpoint `PATCH /inventory/goods-issues/:id`
- Quy tắc giá vốn hai chiều (A-05) và ghi lại đơn giá dòng phiếu thành bình quân gia quyền
- `cancel()` phiếu xuất chạy qua engine, có khoá row
- Quyền `inventory.goods-issue.update`

## Not in scope
- Bút toán kế toán cho phiếu xuất — hiện không có và vẫn để ngoài phạm vi
- Chân phiếu điều chuyển (UOW-05)
- Giao diện (UOW-06)

## Risks
| Risk | Mitigation |
|---|---|
| Một dòng phiếu mang hai mức giá vốn làm INV-2 sai | Ghi lại `unitPrice` của dòng thành bình quân gia quyền của toàn bộ giá trị đã ghi sổ cho dòng đó |
| Giá bình quân lấy sai thời điểm | `getInstantAverageCost` gọi trong cùng transaction, trước khi ghi chênh lệch |

## Definition of done
- [x] AC-12, AC-13, AC-14 pass
- [x] INV-1 và INV-2 đúng sau chuỗi sửa tăng rồi sửa giảm
- [x] Xoá hai lần song song chỉ đảo bút một lần
- [x] `pnpm --filter @erp/api test` xanh (2680/2680)
- [ ] Demoed và được chấp nhận ở G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
- [ ] PR draft copied and contact sheets attached to the PR description
