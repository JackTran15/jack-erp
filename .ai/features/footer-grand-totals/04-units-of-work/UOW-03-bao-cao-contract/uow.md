---
id: UOW-03
slug: bao-cao-contract
title: Hợp đồng phân trang server + lọc cột + totals cho báo cáo kho, demo trên báo cáo xuất kho tạm
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-03, US-04, US-05]
verifies: [AC-12, AC-13, AC-14, AC-15, AC-16, AC-18, AC-21]
risk: high
status: todo
rollback: revert; shell quay lại phân trang client (trần 200 dòng như cũ)
---

# UOW-03 — Hợp đồng chung cho báo cáo kho, demo trên "Hàng hóa xuất kho tạm"

Lát cắt này định nghĩa hợp đồng mà 7 báo cáo còn lại sẽ áp lại. Chọn "Hàng hóa xuất kho tạm" làm
báo cáo demo vì nó rẻ nhất: mọi bộ lọc đã nằm trong CTE `base`, `countSql` chỉ cần mở rộng.

## Demo script
1. Vào Báo cáo → Hàng hóa xuất kho tạm, chọn kỳ cho ra hơn 200 dòng
2. Bấm tới trang cuối → xem được tới dòng cuối cùng mà pager công bố (trước đây dừng ở 200)
3. Chuyển qua lại giữa các trang → dòng tổng cuối bảng **không đổi**
4. Gõ điều kiện `≥` vào ô lọc một cột số → lưới **và** dòng tổng cùng đổi; pager về trang 1
5. Mở tab Network: mỗi lần đổi trang là một request mang đúng `page`/`pageSize`

## In scope
- Từ vựng lọc-theo-cột phía server dùng chung cho báo cáo (DTO + cách áp vào SQL)
- `totals` trong response, nằm trong object được cache
- Khoá cache bao gồm lọc-theo-cột và phân trang; bump `CACHE_NAMESPACE`
- `StorageReportShell` chuyển sang phân trang + lọc phía server, footer đọc `totals`
- Áp đủ cho một báo cáo: Hàng hóa xuất kho tạm

## Not in scope
- 7 báo cáo còn lại (UOW-04, UOW-05, UOW-06)
- Các cột ghép bằng JS (UOW-06)

## Risks
| Risk | Mitigation |
| --- | --- |
| Shell dùng chung, đổi sai làm hỏng cả 8 trang một lúc | 7 trang còn lại giữ nguyên đường cũ cho tới UoW của chúng; shell nhận cờ để chạy hai chế độ trong giai đoạn chuyển tiếp |
| Quên đưa lọc vào khoá cache ⇒ "lọc xong không đổi gì" | Test riêng cho hàm dựng khoá cache |
| Nới trần `pageSize` thành đường ép server tải nặng | Dùng lại trần `MAX_REPORT_ROWS` sẵn có, không bỏ trần |

## Definition of done
- [x] AC-13, AC-15, AC-16, AC-18, AC-21 đạt: đối chiếu trực tiếp trên API (bảng dưới) và ảnh
      `evidence/local-backoffice/desktop/S6.png` — pager đọc `total`, footer đọc `totals`
- [x] AC-12 (không cắt cụt) — trần `pageSize` đã nới lên `MAX_REPORT_ROWS`, `pageSize=1000` trả 200,
      `pageSize=50001` trả 400. Chưa dựng được cảnh >200 dòng vì báo cáo này chỉ có 2 dòng trong
      `erp_dev`; sẽ chụp được ở UOW-04 (báo cáo NXT có 1.540 dòng)
- [x] 7 báo cáo còn lại vẫn chạy như cũ — chúng không bật `serverPaged`, và
      `REPORT_CLIENT_PAGE_SIZE` giữ nguyên hành vi tải một trang lớn
- [x] Hai sai khác so với thiết kế đã ghi vào T-03-02 và T-03-03

## Kiểm chứng: API đối chiếu (chi nhánh HCM, kỳ 08/2026)

| Yêu cầu | total | totals |
| --- | ---: | --- |
| Không lọc | 2 | `outQty 2, returnQty 0, saleQty 1, remainingQty 1` |
| `saleQty >= 1` | 1 | `outQty 1, returnQty 0, saleQty 1, remainingQty 0` |
| `saleQty >= 99` | 0 | tất cả 0 |
| Cột không lọc được | — | HTTP 400 |

Lưới và dòng tổng đổi **cùng nhau** khi lọc — đó là điều kiện để tin được con số ở footer.
