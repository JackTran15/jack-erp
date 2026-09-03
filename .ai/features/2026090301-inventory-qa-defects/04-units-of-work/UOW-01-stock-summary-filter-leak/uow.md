---
id: UOW-01
slug: stock-summary-filter-leak
title: Tổng hợp tồn kho lọc ra đúng thứ đã gõ
demoable: true
duration: 2d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05]
risk: medium
status: done
rollback: revert code — thuần logic đọc, không schema, không dữ liệu
---

# UOW-01 — Tổng hợp tồn kho lọc ra đúng thứ đã gõ

Ô "Bộ lọc" không sai. Sai ở chỗ có **một khối dòng thứ hai** không bao giờ đi qua bộ lọc: truy vấn
"sắp nhận về" (`stock-summary.service.ts:402-440`) chỉ có 4 mệnh đề WHERE và kết quả được ghép vào
mảng **sau** khi trang đã lọc và đã cắt (`:575-618`).

Ba triệu chứng, một nguyên nhân: dòng lạ (`TXV6079`), dòng trùng (khoá chống trùng
`groupKey:storageId` cộng chốt chặn chỉ xét đúng kho đích, `:944-967`), và phân trang không nhất
quán (`total += appended`, trang ≥2 mất hẳn khối này vì `page === 1` ở `:314`).

## Demo script

1. Vào Tổng hợp tồn kho ở một chi nhánh có badge "Điều chuyển từ cửa hàng khác" khác 0, không chọn kho.
2. Gõ `DNGUAB064` vào ô "Bộ lọc", bấm "Lấy dữ liệu" → chỉ còn dòng khớp; `TXV6079` biến mất (AC-01).
3. Kiểm cột Kho của các dòng còn lại → không có hai dòng cùng (SKU, kho) (AC-02).
4. Xoá bộ lọc, đặt pageSize 20 → đếm dòng trang 1 ≤ 20; sang trang 2 rồi quay lại, tổng không đổi (AC-03).
5. Lọc lại theo một mã, đối chiếu tổng "Sắp nhận về" ở footer với tổng cột đang hiển thị (AC-04).
6. Xoá hết bộ lọc → dòng hàng sắp nhận về vẫn hiện với SL tồn 0 và "Sắp nhận về" khác 0 (AC-05).

## In scope

- Áp bộ điều kiện của `buildBaseQuery` lên `pendingOnlyQuery` (ADR-01).
- Gộp trước khi cắt trang, dùng lại đường phân trang trong bộ nhớ đã có ở nhánh `needsDerivedFilter`.
- Sửa CTE `pending_only` của truy vấn tổng footer (`:822-843`).

## Not in scope

- Đổi hạt báo cáo (SKU × kho) — đã chốt ở `c36be5ab`, không mở lại.
- Bỏ hẳn khối "sắp nhận về" khi có bộ lọc (**A-03** đã loại).
- Tối ưu hiệu năng ngoài việc không làm xấu đi (đo ở T-01-02).

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Chưa đối chiếu được với dữ liệu thật vì Postgres cục bộ đang tắt (**A-01**) | T-01-01 bắt buộc tái hiện và ghi lại số dòng trước khi sửa |
| Materialise cả tập khi có hàng đang về làm chậm endpoint (ADR-01) | T-01-02 đo thời gian phản hồi trước/sau và ghi vào ticket |
| Dòng thứ hai của `DNGUAB064` có thể là **hợp lệ** (khác kho) chứ không phải trùng | T-01-01 xác định rõ trước khi T-01-02 chọn cách sửa khoá chống trùng |

## Definition of done

- [x] AC-01…AC-05 pass
- [x] `stock-summary.service.spec.ts` có ca "bộ lọc áp lên cả dòng sắp nhận về" và ca "trang 1 không vượt pageSize"
- [x] Ghi vào ticket: số dòng trả về trước/sau khi sửa, trên cùng một bộ lọc
- [x] Thời gian phản hồi `POST /v2/inventory/stock/summary/search` không xấu đi đáng kể
- [x] Demoed và accepted at gate G4 — **trên hồ sơ bằng chứng**, xem mục dưới

## Cơ sở chấp nhận G4 (Akenzy uỷ quyền 03/09/2026)

G4 được chấp nhận trên **hồ sơ bằng chứng**, không phải một buổi demo trực tiếp. Ghi rõ ở đây để
người đọc sau không hiểu nhầm là đã có người ngồi xem từng bước:

- `stock-summary.service.spec.ts` **24/24 xanh**; toàn bộ suite `ledger` **103/103**.
- Đo trên Postgres thật (`erp_clone_24`, tổ chức MT, `pageSize: 20`): trang 1 **55 → 20** dòng;
  ba trang cho **60 khoá phân biệt, không chồng lấn**; tổng footer **76 → 0** với bộ lọc không
  khớp dòng nào; `search` hình SQL-injection trả 0 dòng chứ không lỗi cú pháp.
- AC-05 (không lọc thì dòng "sắp nhận về" vẫn hiện) có test riêng.

**Chưa được chứng minh bằng mắt trên UI**: chưa ai gõ `DNGUAB064` vào ô "Bộ lọc" của bản chạy thật
và nhìn `TXV6079` biến mất. Hai mã đó chỉ có trên production (đã quét 7 DB cục bộ).
