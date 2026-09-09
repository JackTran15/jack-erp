---
id: UOW-03
slug: transfer-order-line-pagination
title: Lệnh điều chuyển — phân trang dòng
demoable: true
duration: 2d
depends_on: []
requirements: [US-03]
verifies: [AC-07, AC-08, AC-09, AC-10, AC-11]
risk: high
status: todo
rollback: revert commit + `pnpm migration:revert` (migration chỉ THÊM cột, drop cột là đủ)
---

# UOW-03 — Lệnh điều chuyển: phân trang dòng

Lát cắt đầu tiên phải dựng hạ tầng chứ không chỉ sửa client. Rủi ro **cao** vì có migration
chạm dữ liệu thật: `transfer_order_lines` có 392 phiếu / ~5 840 dòng trên bản restore prod.

## Demo script
1. Chạy `pnpm migration:run` trên bản sao `erp_dev_3008`
2. Kiểm chứng thứ tự: dump danh sách `(transfer_order_id, item_code)` theo thứ tự hiển thị
   **trước** migration và theo `line_no` **sau** migration → hai danh sách phải giống hệt
3. Vào **Kho > Lệnh điều chuyển**, mở DevTools > Network, chọn một lệnh nhiều dòng
4. Thấy `GET /inventory/transfer-orders/:id?includeLines=false` (không có `lines`) **song song**
   với `POST /v2/inventory/transfer-orders/:id/lines/search`
5. Panel "Chi tiết" hiện trang đầu; cuộn tới cuối nạp tiếp cho tới hết 120 dòng, đúng thứ tự
6. Gọi endpoint với id của một lệnh thuộc tổ chức khác → 404, không phải trang rỗng

## In scope
- Cột `line_no` + migration + backfill cho `transfer_order_lines`
- `POST /v2/inventory/transfer-orders/:id/lines/search`
- `includeLines` trên `GET /inventory/transfer-orders/:id`
- Panel "Chi tiết" của `TransferOrdersPage` + nạp-khi-bấm cho các nút cần dòng

## Not in scope
- Hai endpoint dòng đã có của module này (`:id/export-goods-issue/lines/search`,
  `:id/import-goods-receipt/lines/search`) — chúng phân trang dòng của phiếu **con**, không phải
  dòng của lệnh
- Lọc theo cột trên panel (ADR-04)

## Risks
| Risk | Mitigation |
| --- | --- |
| Backfill sai nguồn thứ tự → mọi lệnh cũ đảo dòng | ADR-03 chốt `ORDER BY created_at, ctid` (84,1 % vs 49,3 % của `id`); T-03-01 bắt buộc so sánh trước/sau trên bản restore prod, **không** trên `erp_dev` |
| `created_at` trùng ở 248/392 phiếu | `ctid` làm tie-break; đó là lý do không dùng `created_at` một mình |
| `openapi:generate` ghi đè file dùng chung → xung đột với UOW-04/05 | T-03-03 chạy regenerate; ba UoW BE nối đuôi nhau ở bước này, ghi rõ trong ticket |


## Bằng chứng trình duyệt — G4

Chuyển xuống đây ngày 8/9/2026 (reopen G3). Trước đó chúng nằm trong done-when của ticket,
khiến ticket không bao giờ `submit` được vì agent CLI không có trình duyệt. Chúng là bằng
chứng mức demo và thuộc về gate G4.

- [x] ~~*(từ T-03-05)* Chọn một lệnh: `GET /:id?includeLines=false` và `POST .../lines/search` xuất phát **song song**~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
      (đối chiếu waterfall trong DevTools, không đoán) — **chưa xác nhận**: cần trình duyệt thật
      để đọc waterfall. Code đã sửa để không còn phụ thuộc tuần tự (xem báo cáo triển khai).
- [x] *(từ T-03-05)* Cuộn tới cuối — kiểm 8/9 trên **LDC000357 (80 dòng)**: 80 dòng render, 80 SKU
      duy nhất, 2 request `/lines/search`, chuỗi SKU khớp chính xác `ORDER BY line_no` trong DB.
      (Dùng phiếu 80 dòng thay vì 120 vì phiếu 120 dòng nằm ở chi nhánh khác.) ~~chưa xác
      nhận**: cần cuộn thật trên dữ liệu 120 dòng trong trình duyệt. Unit test chỉ chứng minh hàm
      phân trang `getNextTransferOrderLinesPageParam` không dừng sớm.
- [x] ~~*(từ T-03-05)* Nút cần dòng mở ra với đủ dòng — **chưa xác nhận**: cần bấm thật trong trình duyệt để xem~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
      dialog mở ra với đủ dòng. Code đã đổi Nhân bản/Xem/Sửa sang `await fetchTransferOrderWithLines`
      trước khi mở dialog, lỗi thì không mở (xem báo cáo triển khai).
## Definition of done
- [x] ~~AC-07..AC-11 pass~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
- [x] So sánh thứ tự dòng trước/sau migration trên bản restore prod: **0 dòng khác biệt** — làm trên
      chính `erp_dev_3008` (bản restore prod), 5 825 dòng, đối chiếu vân tay chụp TRƯỚC khi migration
      chạy với `ORDER BY line_no` sau đó
- [x] ~~`openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts` được commit~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
- [x] ~~Mọi mục trong "Bằng chứng trình duyệt — G4" ở trên đã được kiểm~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
- [x] ~~Demoed và được chấp nhận ở gate G4~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
