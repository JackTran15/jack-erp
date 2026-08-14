---
id: UOW-02
slug: ton-kho-totals
title: Sáu cột số của Tổng hợp tồn kho có tổng toàn tập
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-06, AC-07, AC-08, AC-09, AC-10, AC-11]
risk: high
status: todo
rollback: đặt includeTotals = false ở mọi đường gọi → về đúng hành vi cũ (chỉ còn totalQuantity)
---

# UOW-02 — Sáu cột số của Tổng hợp tồn kho có tổng toàn tập

Rủi ro cao vì phần tổng phải join vào toàn tập ~8k cặp (item, storage) thay vì 50 cặp của trang.

## Demo script
1. Vào Kho hàng → Tổng hợp tồn kho, chi nhánh Buôn Ma Thuật, không đặt kỳ
2. Ghi lại 6 số ở footer; chuyển sang trang 2, đổi 50 → 100 dòng/trang → cả 6 số **không đổi**
3. Bật "Từ ngày / Đến ngày" → kiểm tra footer thoả `SL tồn = Tồn đầu kỳ + SL nhập − SL xuất`
4. Bật loại trừ hàng giữ chỗ → footer SL tồn giảm đúng phần đã giữ chỗ
5. Đặt filter trên cột "SL nhập" → footer tính lại trên tập đã lọc
6. Chạy xuất khẩu tồn kho → file ra giống hệt trước thay đổi

## In scope
- `totals` 8 field trong response tồn kho, tính trên toàn tập
- Nhánh lọc dẫn xuất tính tổng bằng reduce trên tập đã lọc
- Cờ `includeTotals` để xuất khẩu không gánh chi phí thừa
- FE đọc `totals`, bỏ `visibleTotals`

## Not in scope
- Sửa `total` lệch giữa trang 1 và trang ≥2 (`stock-summary.service.ts:513`) — defect có sẵn
- Sửa việc dòng pending-only không chịu filter của lưới — A-04, giữ nguyên quirk

## Risks
| Risk | Mitigation |
| --- | --- |
| CTE `period` quét nặng ở ~8k cặp | `EXPLAIN ANALYZE` trước khi merge (T-02-01); van xả `includeTotals` |
| Cộng hai lần dòng "sắp nhận về" | Hai tập rời nhau nhờ `NOT EXISTS`; AC-09 kiểm ở cả trang 1 và trang 2 |
| Xuất khẩu chậm gấp bội do lặp 40 trang | T-02-03 tắt totals cho đường xuất khẩu, có test |

## Definition of done
- [x] AC-06..AC-11 pass — đối chiếu ở tầng API + SQL (xem bảng dưới); AC-08 (loại trừ hàng giữ chỗ)
      mới kiểm ở mức công thức: server trả `reservedQty`, FE trừ đúng như `displayStockQuantity`
- [x] `EXPLAIN ANALYZE`: Planning 2.3 ms / Execution 5.5 ms trên 1.540 cặp item-kho (T-02-01)
- [x] Không thêm round-trip: statement mới **thay thế** aggregate cũ, vẫn trong cùng `Promise.all`;
      nhánh lọc dẫn xuất còn tiết kiệm được một truy vấn
- [x] Demo trên trình duyệt: `evidence/local-backoffice/desktop/S4.png` (trang 1) và `S5.png`
      (**trang 31/31**, dòng 1501–1540) — footer "SL tồn" đều là **2.155**, khớp SQL. Đây đúng là
      cảnh mà mã cũ sẽ hiển thị tổng của 40 dòng đang xem. Phải gieo phiên gắn chi nhánh HCM
      trước khi chạy, xem `07-verification.md` mục Notes

## Kiểm chứng: API đối chiếu SQL (chi nhánh HCM, `erp_dev`, kỳ 08/2026)

| Truy vấn | total | totals.quantity | openingQty | inQty | outQty | closingQty |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `limit=2` | 1540 | 2155 | 0 | 2196 | 41 | 2155 |
| `limit=200` | 1540 | 2155 | 0 | 2196 | 41 | 2155 |
| `page=5, limit=200` | 1540 | 2155 | 0 | 2196 | 41 | 2155 |
| SQL trực tiếp | — | 2155 | — | 2196 | 41 | — |

Tổng không đổi khi chuyển trang, và `0 + 2196 − 41 = 2155` đúng hằng đẳng thức AC-07.
