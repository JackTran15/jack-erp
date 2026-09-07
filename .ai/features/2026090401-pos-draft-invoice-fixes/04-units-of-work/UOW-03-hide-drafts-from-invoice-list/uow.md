---
id: UOW-03
slug: hide-drafts-from-invoice-list
title: Danh sách hoá đơn không còn hoá đơn Nháp
demoable: true
duration: 1d
depends_on: []
requirements: [US-03]
verifies: [AC-10, AC-11, AC-12, AC-13]
risk: low
status: todo
rollback: revert 1 commit; endpoint quay lại trả cả nháp
---

# UOW-03 — "DS hoá đơn" không còn hoá đơn Nháp

## Demo script
1. Đăng nhập POS local (:3001) ở một chi nhánh có sẵn vài phiếu lưu tạm hôm nay.
2. Tạo thêm 2–3 phiếu lưu tạm và 1 hoá đơn đã thanh toán trong hôm nay.
3. Mở "DS hoá đơn", lọc "Ngày tạo / Hôm nay", trạng thái "Tất cả".
   → Không còn dòng nào mang badge "Nháp".
   → "Tổng tiền" cuối bảng bằng tổng cột "Tổng thanh toán" của các dòng đang hiện.
   → Ô đếm kết quả khớp số dòng.
4. Chuyển bộ lọc trạng thái qua từng giá trị (Đã thanh toán / Ghi nợ / Nợ một phần / Chờ xử
   lý / Đã hủy) → mỗi trạng thái vẫn ra đúng hoá đơn của nó.
5. Quay lại màn bán hàng, mở "HĐ lưu tạm" → dialog vẫn liệt kê đủ các phiếu nháp vừa tạo.

## In scope
- Một mệnh đề `status <> 'draft'` trong `SearchInvoicesV2Handler.buildQuery()`.

## Not in scope
- Thêm giá trị "Nháp" vào bộ lọc trạng thái của bảng (A-04 đã chốt: nháp xem ở dialog riêng).
- Các endpoint hoá đơn khác (returnable / purchase-history / drafts) — không đụng.

## Risks
| Risk | Mitigation |
| --- | --- |
| Lọc lây sang màn khác nếu endpoint có nhiều nơi dùng | A-03 đã grep toàn repo: chỉ `useInvoiceList` dùng. T-03-02 chốt bằng test cho endpoint nháp |

## Definition of done
- [x] AC-10..AC-12 đo trên dữ liệu thật `erp_dev` qua API (15 nháp + 70 hoá đơn → `total: 70`,
      không dòng nháp nào, 4 trạng thái còn lại đủ); AC-13 khoá bằng spec + gọi thật endpoint nháp
- [x] `pnpm --filter @erp/api test -- search-invoices-v2` xanh 18/18
- [x] Demo script chạy hết trên trình duyệt: `S1` cho `1-70/70 kết quả`, không dòng "Nháp"
      nào dù chi nhánh có 15 phiếu nháp; `S2` cho đủ Đã thanh toán / Nợ một phần / Đã hủy;
      `S3` cho dialog "HĐ lưu tạm" vẫn liệt kê `DRAFT-1787570592232`
- [ ] Chưa commit

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment (local-pos, 4/4 bước)
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated và commit sha khớp HEAD (`b75fd7cf`)
- [ ] PR draft copied và contact sheet đính vào mô tả PR — chưa mở PR
