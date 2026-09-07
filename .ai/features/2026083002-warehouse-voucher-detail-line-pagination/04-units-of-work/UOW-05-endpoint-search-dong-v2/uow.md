---
id: UOW-05
slug: endpoint-search-dong-v2
title: Endpoint POST lines/search theo mẫu CQRS V2 cho cả hai loại phiếu
demoable: true
duration: 1d
depends_on: [UOW-04]
requirements: [US-04]
verifies: [AC-12, AC-13]
risk: medium
status: todo
rollback: hoàn tác các commit backend của UoW này; `GET /:id/lines` vẫn còn nguyên và mọi consumer vẫn chạy — endpoint mới chưa có ai gọi nên gỡ đi không ai thấy.
---

# UOW-05 — Endpoint `POST .../lines/search`

## Why this slice exists

`GET /:id/lines` chỉ nhận `PaginationQueryDto`. Lọc mang theo **toán tử** (`*` substring,
`≤` so sánh số) chứ không chỉ giá trị, nên nhét vào query string là tự phát minh một cú
pháp mã hoá thứ hai trong repo. Mẫu V2 đã giải xong bài này bằng body và đang chạy cho
danh sách phiếu (ADR-06).

Slice này **chỉ dựng endpoint mới**, không gỡ gì. `GET /:id/lines` còn nguyên đến hết
UOW-06. Cắt như vậy có chủ ý: gỡ endpoint trong lúc hai dialog vẫn gọi nó thì mọi trạng
thái trung gian đều hỏng và không slice nào demo được. Việc gỡ đi cùng chỗ với consumer
cuối cùng, ở UOW-06.

## Demo script

1. Mở `/docs`, tìm `POST /v2/inventory/goods-issues/{id}/lines/search`.
2. Gọi với body rỗng `{}` trên một phiếu 200 dòng → trả 50 dòng đầu, `total` là 200,
   `totals` là tổng toàn phiếu.
3. Gọi với `{"itemCode": {"operator": "*", "value": "<mã của dòng thứ 180>"}}` → trả đúng
   dòng đó, `total` là 1, `totals` là số của riêng dòng đó.
4. Gọi với `{"quantity": {"operator": "<=", "value": 2}}` → chỉ dòng có số lượng ≤ 2.
5. Gọi cùng phiếu bằng token của chi nhánh khác → 404, không phải danh sách rỗng.
6. Lặp bước 2–4 với `POST /v2/goods-receipts/{id}/lines/search`.
7. Đọc DTO: không có trường nào cho phép đổi thứ tự sắp xếp (AC-13).

## In scope

- `GoodsIssueLineSearchV2Dto` + query + `@QueryHandler` + route trên `GoodsIssueV2Controller`.
- Đối xứng cho phiếu nhập trên `GoodsReceiptV2Controller`.
- Wiring handler vào hai module.
- Test handler cho lọc, tổng theo tập lọc, thứ tự, và phạm vi org/branch.

## Not in scope

- Gỡ `GET /:id/lines` — UOW-06.
- Bất kỳ thay đổi nào phía web — UOW-06.
- Lọc theo Kho / Vị trí / ĐVT (A-15).

## Risks

| Risk | Mitigation |
| --- | --- |
| `totals` tính trên cả phiếu thay vì tập đã lọc, và không ai thấy vì phiếu test không có bộ lọc | T-05-03 có test riêng cho đúng chỗ này: cùng phiếu, có lọc và không lọc, `totals` phải khác nhau |
| Handler quên `organizationId`/`branchId` vì đã kiểm ở phiếu cha | Test bước 5 gọi bằng chi nhánh khác và đòi 404 |
| Join `items` làm hỏng đếm `total` khi một dòng khớp nhiều hàng | Quan hệ dòng→item là many-to-one nên join không nhân bản; vẫn khẳng định bằng test đếm trên phiếu có hai dòng cùng một mặt hàng |
| Người sau thêm `sort` vào DTO cho tiện | ADR-07 nói rõ lý do; T-05-01 để lại comment tại chỗ trên DTO |

## Definition of done

- [x] AC-12, AC-13 pass
- [x] Cả hai có trong `/docs-json` và đã gọi thật qua HTTP (T-05-01: 16 phép kiểm, T-05-02: 11)
- [x] 23 test ở T-05-03, xanh
- [x] `/docs-json` cho thấy đúng 7 trường mỗi DTO; gửi `{"sort":…}` bị `forbidNonWhitelisted` trả 400
- [x] Demoed và được chấp nhận ở gate G4 — Akenzy, 2026-09-03
