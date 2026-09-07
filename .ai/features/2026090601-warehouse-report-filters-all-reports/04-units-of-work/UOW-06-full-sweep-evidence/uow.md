---
id: UOW-06
slug: full-sweep-evidence
title: Quét toàn tuyến 11 báo cáo × 3 hạt
demoable: true
duration: 1d
depends_on: [UOW-02, UOW-03, UOW-04, UOW-05]
requirements: [US-06]
verifies: [AC-15, AC-16]
risk: low
status: todo
rollback: Không có mã sản phẩm — chỉ test và evidence
---

# UOW-06 — Quét toàn tuyến 11 báo cáo × 3 hạt

## Demo script
1. Chạy bộ quét: 11 loại báo cáo × 3 hạt × từng dòng lọc mà báo cáo đó khai
2. Bảng kết quả: 0 tổ hợp trả 400
3. Với mỗi bộ lọc, một lượt có giá trị và một lượt không → hoặc số dòng đổi, hoặc dòng lọc đó không được form chào mời
4. Không ô nào rơi vào "nhận giá trị, trả 201, tập kết quả không đổi"

## In scope
- Bộ quét chạy được lặp lại, và báo cáo bằng chứng cho cả 11 loại

## Not in scope
- Nhóm Bán hàng / Công nợ / Lợi nhuận

## Risks
| Risk | Mitigation |
| --- | --- |
| Probe đếm nhầm vì `POST /search` trả **201** | Bộ quét coi 2xx là thành công, không so `== 200` |
| Cột luôn bằng 0 trên `erp_dev_3008` bị xếp nhầm sang "lọc được" | Loại số `0` khi đếm cột có dữ liệu — bẫy đã dính một lần tháng 8 |

## Definition of done
- [x] AC-15 và AC-16 pass
- [x] Bảng quét đầy đủ 11 loại × 3 hạt được ghi vào `evidence/`
- [x] Bộ quét chạy lại được bằng một lệnh
