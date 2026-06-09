# TKT-GIR-04 FE: gửi + load lại đủ trường, fix Kho/Vị trí + Cửa hàng đích + Tham chiếu list

## Epic

[EPIC-08062026 Phiếu xuất kho — round-trip đầy đủ trường](../epics/EPIC-08062026-goods-issue-form-roundtrip.md)

## Layer

🟨 Frontend — `apps/backoffice-web/src/pages/goods-issue/GoodsIssuePage.tsx` (+ `GoodsIssue` type local).

## Summary

Làm form phiếu xuất kho **gửi** các trường mới và **load lại** đủ khi view/edit. Fix các bug map đã xác định: `targetBranchLabel` không init từ `initial.targetBranch.name`; DetailPanel read-only dùng `issue.location` (header) cho mọi dòng thay vì `line.location`; Người giao không gửi; Tham chiếu là **list**.

## Deliverables

- **`GoodsIssue` interface** (local trong page) + line type: thêm `deliverer?`, `references?: string[]`, `occurredAt?: string`; line đã có `location{ code, storageId }`.
- **`handleSave` payload** `POST /inventory/goods-issues` — thêm:
  ```ts
  deliverer: deliveryPerson || undefined,
  references: referenceList.length ? referenceList : undefined,
  occurredAt: combineDateTime(docDate, docTime),   // ISO từ Ngày xuất + Giờ xuất
  ```
- **Init từ `initial`** (view/edit):
  - `deliveryPerson` ← `initial.deliverer ?? ""` (hiện luôn `""`).
  - `targetBranchLabel` ← `initial.targetBranch?.name ?? ""` (hiện luôn `""` — bug Cửa hàng đích trống).
  - Danh sách Tham chiếu ← `initial.references ?? []` (render list; giữ resolve STOCK_TAKE/TRANSFER_ORDER hiện có nếu muốn, nhưng nguồn chính là `references`).
  - `docDate`/`docTime` ← tách từ `initial.occurredAt ?? initial.createdAt`.
- **DetailPanel (read-only table)** — đổi `issue.location?.storageId`/`issue.location?.code` → **`line.location?.storageId`/`line.location?.code`** cho từng dòng (Kho + Vị trí đúng theo dòng). (Form lines edit đã map đúng từ `l.location` — giữ.)
- **Người giao field** — bind sẵn `deliveryPerson`; nay được gửi + init.

## Acceptance Criteria

- [ ] Tạo phiếu điền đủ → mở lại: Đối tượng, Người giao, Diễn giải, **Tham chiếu (list)**, Ngày/Giờ xuất, **Cửa hàng đích**, và **Kho + Vị trí từng dòng** hiển thị đúng.
- [ ] Hai dòng kho/vị trí khác nhau hiển thị khác nhau (không dùng location header chung).
- [ ] `purpose=TRANSFER_OUT`: Cửa hàng đích hiện tên (không còn "Chọn cửa hàng đích" trống khi đã có `targetBranchId`).
- [ ] Người giao gửi lên BE và load lại đúng.
- [ ] Phiếu cũ (`occurredAt` null, `references` `[]`) vẫn hiển thị bình thường (Ngày = createdAt, Tham chiếu rỗng).

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` (tsc) xanh.
- [ ] Named exports, `interface Props` tách rời (convention repo); chuỗi UI tiếng Việt.
- [ ] Verify trực quan: screenshot phiếu xem lại đủ trường (so với bug hiện tại).

## Tech Approach

- `combineDateTime(date, time)` → ISO (vi-VN không cần; gửi ISO UTC). Nếu chỉ có ngày, mặc định giờ hiện tại/`00:00`.
- Tham chiếu list: `referenceList: string[]` state; hiển thị các chip/links; nguồn từ `initial.references`. (FE quyết định cách nhập danh sách — tối thiểu hiển thị + giữ giá trị round-trip.)
- Resolve tên kho từ `line.location.storageId` qua mảng `storages` đã fetch (đã có pattern trong page).

## Dependencies

- Depends on: TKT-GIR-02 (read trả `lines.location` + 3 trường), TKT-GIR-03 (snapshot).
- Blocks: TKT-GIR-05.
