---
id: UOW-01
slug: doi-nhan-kho-tam
title: Dòng bán qua kho tạm đọc là "Bán hàng kho tạm", bộ lọc trạng thái đúng 5 giá trị
demoable: true
duration: 1d
depends_on: []
requirements: [US-01, US-02]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05]   # AC có ẢNH CHỤP; AC-06/AC-07 xem 07-verification.md
risk: low
status: todo
rollback: revert commit; không đổi schema, không đổi hợp đồng API — chỉ một chuỗi hiển thị và một danh sách filter
---

# UOW-01 — Dòng bán qua kho tạm đọc là "Bán hàng kho tạm"

Lát cắt sửa cái sai đang thấy được ngay trên màn hình: nhãn trạng thái mô tả sai nghiệp vụ, và
danh sách giá trị lọc lệch nhau ở ba nơi.

Sau khi UOW-02 bị gỡ (ADR-05), đây là **toàn bộ** thay đổi hành vi của tính năng.

## Demo script
1. Đăng nhập backoffice, chọn chi nhánh Buôn Ma Thuật
2. Vào Báo cáo → Hàng hóa xuất kho tạm, đặt kỳ "Tháng này", bấm Lấy dữ liệu
3. Mọi dòng có số ở cột "Hóa đơn bán" đọc **"Bán hàng kho tạm"** (trước đây là "Bán hàng trưng bày")
4. Các dòng "Chuyển kho xuất đi" / "Xuất không bán" giữ nguyên nhãn như trước
5. Mở bộ lọc cột "Trạng thái" → liệt kê đúng 5 giá trị, không có giá trị nào lọc ra rỗng
6. Chọn "Bán hàng kho tạm" → lưới chỉ còn dòng đó, footer cộng theo
7. Lặp bước 5–6 ở chế độ chuỗi cửa hàng (`/reports/inventory`, chọn báo cáo Hàng hóa xuất kho tạm)

## In scope
- Đổi nhãn nhánh `invoice_id IS NOT NULL` trong CASE trạng thái
- Chuyển `sale_qty` / `remaining_qty` từ `enriched` xuống `paired` (giá trị không đổi)
- Bump report key của cache để entry cũ mang nhãn cũ không sống sót qua deploy
- `TEMP_WAREHOUSE_OUT_STATUS_OPTIONS`: `Bán hàng trưng bày` → `Bán hàng kho tạm`
- Hai chỗ hard-code danh sách trạng thái ở frontend import lại từ hằng shared

## Not in scope
- Nguồn dữ liệu bán showroom — đã thử ở UOW-02 rồi gỡ, xem ADR-05
- Xác nhận Xuất khẩu / In (UOW-03)
- Sửa defect hóa đơn bị hủy vẫn tính là đã bán (có sẵn từ trước, xem ADR-05 mục 3)

## Risks
| Risk | Mitigation |
| --- | --- |
| Chuyển `sale_qty`/`remaining_qty` xuống `paired` làm lệch số so với công thức cũ | Spec khóa: cùng dữ liệu, 4 cột số trả về y hệt trước thay đổi (AC-04) |
| Registry chuỗi cửa hàng dùng shape option khác `ReportFilterOption` | Đọc `selectCol` trong registry trước khi thay; map lại nếu shape khác, không đổi hằng shared |
| Người dùng đã lưu template báo cáo có filter `"Bán hàng trưng bày"` | Giá trị đó **không còn tồn tại**. Template cũ sẽ lọc ra rỗng thay vì lỗi. Phải ghi trong ghi chú phát hành: đổi filter sang `Bán hàng kho tạm` |

## Ghi chú về `verifies:`

Trường này là hợp đồng **bằng chứng trình duyệt** (`evidence_check.py` đòi một ảnh chụp xanh cho
mỗi AC liệt kê ở đây), không phải danh sách AC mà lát cắt giao. Độ phủ AC tính từ `verifies:` của
**ticket**, và ở đó AC-06/AC-07 vẫn được T-01-03 phủ.

Hai AC không có mặt ở đây, lý do đầy đủ trong `07-verification.md` mục "Not verified here":
- **AC-06** (chọn trạng thái thì lưới lọc thật) — ô lọc là `<select>` gốc; bốn động từ của runner
  không đặt được giá trị cho nó, và bộ lọc **không** đồng bộ lên URL nên cũng không tới được bằng
  `Path`. Đã kiểm tay trên trình duyệt: chọn `Bán hàng kho tạm` → 4 dòng, đúng SQL. Khoá bằng
  `temp-warehouse-out.report.spec.ts`.
- **AC-07** (danh sách trạng thái khai báo một lần) là tính chất của mã nguồn, không có bề mặt UI.

## Definition of done
- [x] AC-01..AC-07 pass
- [x] `pnpm --filter @erp/api test` xanh — 217 suite / 1991 test
- [x] `TEMP_WAREHOUSE_OUT_STATUS_OPTIONS` là nơi duy nhất liệt kê 5 giá trị
- [x] Demo chạy trên máy thật, có ảnh chụp — `evidence/local-backoffice/desktop/S1..S4.png`

## Verification evidence
- [x] `verify.py --write` xanh trên `local-backoffice` — 4/4 bước
- [x] Có bằng chứng cho mọi AC trong `verifies` (AC-01..AC-05), ở viewport desktop
- [x] `08-evidence.md` đã sinh lại; `evidence_check.py` xác nhận sha `baff9990` khớp HEAD
- [ ] Bản nháp PR đã chép và contact sheet đã đính vào mô tả PR
