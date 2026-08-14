---
id: UOW-06
slug: cot-ghep-js
title: Cột ghép bằng JS lọc được và có tổng — báo cáo pivot và hai cột điều chuyển
demoable: true
duration: 2d
depends_on: [UOW-04, UOW-05]
requirements: [US-04, US-05, US-06]
verifies: [AC-17, AC-20, AC-22]
risk: high
status: todo
rollback: bỏ ô lọc ở các cột này và ẩn footer của chúng; phần còn lại của báo cáo vẫn chạy
---

# UOW-06 — Cột ghép bằng JS lọc được và có tổng

Lát cắt cuối và rủi ro nhất (ADR-004). Gồm:
- Báo cáo Tồn kho theo chi nhánh (pivot) — ô của nó chỉ tính cho `itemIds` của trang
- Hai cột "Đang chuyển đi" / "Sắp nhận về" của `StockPeriodService` — ghép bằng JS theo trang

Đây cũng là lát cắt xoá cờ chuyển tiếp của shell, khép lại hợp đồng.

## Demo script
1. Báo cáo → Số lượng tồn theo cửa hàng: mỗi cột chi nhánh có tổng riêng; cột "Tổng" bằng đúng
   tổng các cột chi nhánh; chuyển trang → không đổi
2. Lọc trên một cột chi nhánh → lưới và footer cùng đổi
3. Báo cáo → Tổng hợp nhập xuất tồn: hai cột "Đang chuyển đi" / "Sắp nhận về" đã có ô lọc và có
   footer; chuyển trang → không đổi
4. Đổi chế độ gộp sang nhóm hàng → hai cột đó bằng 0 ở cả ô lẫn footer (đúng cấu trúc truy vấn hiện tại)

## In scope
- Truy vấn tổng theo chi nhánh cho báo cáo pivot (query mới, +1 trong `Promise.all`)
- Semi-join pending transfer vào toàn bộ row key set của `StockPeriodService`
- Xoá cờ chuyển tiếp của `StorageReportShell`

## Not in scope
- Sửa quirk khử trùng `incomingAssigned` — tái hiện nguyên trạng (A-04); câu hỏi nghiệp vụ ghi riêng

## Risks
| Risk | Mitigation |
| --- | --- |
| Semi-join nhân dòng làm tổng phình | Tập row key duy nhất theo `(item_id, group_key)`; test trên dữ liệu có nhiều nguồn gửi tới cùng đích |
| Tái hiện sai quirk khử trùng ⇒ footer lệch cột | Viết test khoá đúng hành vi hiện tại **trước**, rồi mới đổi |
| Cột động của pivot làm hỏng khoá `totals` | Chốt dot-path `perBranch.<branchId>` (ADR-002) và test khoá |

## Definition of done
- [x] AC-17 (mọi cột lọc/tổng được) — ảnh `S13`: cột "Đang chuyển đi" có footer 1.050.000 ở trang
      cuối, trong khi dòng mang số đó nằm ở trang khác
- [x] AC-20 (cột động của pivot) — ảnh `S14`/`S15`: cột "Tổng" = 2.152 = 2.150 (HCM) + 2 (CN2),
      không đổi ở trang cuối; footer đọc `perBranch.<id>` của server
- [x] AC-22: `pnpm --filter @erp/api test` 211 suite / 1.909 test xanh; `tsc` sạch cả hai app
- [x] Cờ `serverPaged` đã xoá; cả 8 trang chạy cùng một đường, shell không còn nhánh client
- [x] Câu hỏi nghiệp vụ về `incomingAssigned` đã khoá bằng test đặc tả hiện trạng và ghi trong
      T-06-01/T-06-02 (đếm thiếu khi một mã hàng về cùng đích từ nhiều nguồn)
