---
feature: 2026091802-cash-fund-reports
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Báo cáo "Quỹ tiền"

## Môi trường

Dữ liệu là **fixture của e2e** (`apps/api/test/e2e/setup/cash-fund-fixture.ts`, bảng PT-01..PC-07
trong `02-requirements.md`) nằm trong DB `erp_test` sau khi chạy
`pnpm --filter @erp/api test:e2e -- cash-fund-report` (teardown không xoá DB). Tổ chức
`a0000000-0000-4000-8000-000000000001`, tài khoản `admin@test.com` / `password123`, chi nhánh
**Main Branch** (`b0000000-…-0001`). Không dùng `erp_dev`: nó còn 5 migration chưa chạy và
`.ai/credentials.env` trỏ tổ chức của nó, nên `aidlc-verify` (đọc file trước env) không đăng
nhập được vào `erp_test` — kịch bản chạy bằng Playwright trực tiếp trong venv của runner.

```bash
pnpm --filter @erp/api test:e2e -- cash-fund-report                       # nạp fixture vào erp_test
lsof -nP -iTCP:4000 -sTCP:LISTEN                                          # KHÔNG chạy nest build khi :4000 đang lên
(cd apps/api && DB_NAME=erp_test PORT=4055 OUTBOX_RELAY_DISABLED=1 node dist/main.js &)
(cd apps/backoffice-web && VITE_API_BASE_URL=http://localhost:4055 npx vite --port 3005 --strictPort &)
~/.venvs/aidlc-verify/bin/python .ai/features/2026091802-cash-fund-reports/verify-t0106.py
```

Ảnh rơi vào `evidence/t0106-*.png` (thư mục bị gitignore, như mọi feature).

## Steps — UOW-01 (Tình hình thu chi)

| ID | Step | Verifies | Assert (script) | Evidence |
|---|---|---|---|---|
| S1 | Menu Báo cáo → flyout có "Quỹ tiền" (cùng "Bán hàng", "Kho"; không có Công nợ/Lợi nhuận vì tài khoản test không có quyền đó) → `/reports/cash-fund` | AC-01 | url bắt đầu bằng `/reports/cash-fund` | `t0106-01-nav.png` |
| S2 | "Chọn báo cáo" → select Báo cáo liệt kê đúng 5 báo cáo theo thứ tự MShopKeeper | AC-01 | danh sách == [Tình hình thu chi, Bảng kê thu chi, Chi tiền theo mục chi, Bảng kê tiền chi theo mục chi, Chi tiền theo thời gian] | `t0106-02-dropdown.png` |
| S3 | Từ ngày 01/01/2026 – Đến ngày 31/12/2026 → Lấy dữ liệu: 11 dòng, I 0/1.000.000, II 1.570.000/1.600.000 (Thu từ bán hàng 1.500.000/1.600.000, Thu lãi 50.000, Thu khác 20.000), III 400.000/0 (Chi mua hàng hóa 200.000, Tiền điện 150.000, Tiền nước 10.000, Chi khác 40.000), IV 1.170.000/2.600.000; I/II/III/IV đậm, dòng con thụt lề | AC-03, AC-04, AC-05 | nhãn + số từng dòng; font-weight 600 vs 400 | `t0106-03-nam-nay.png` |
| S4 | Kỳ 2025 → 8 dòng khung, toàn 0 | AC-06 | 8 dòng, mọi ô "0" | `t0106-04-nam-truoc.png` |
| S5 | Xuất khẩu → tải `tinh-hinh-thu-chi.xlsx` (~7 KB) | AC-19 | download `.xlsx`, > 2 KB | — |
| S6 | In ▾ → Khổ A4 (dọc) → tài liệu in được dựng trong iframe và gọi `print()` (2 lần: iframe + fallback), HTML chứa "TÌNH HÌNH THU CHI" và dòng IV | AC-20 | `window.print` stub đếm ≥ 1 | `t0106-05a-print-menu.png` |
| S7 | Sửa mẫu: 4 cột, tắt "Tiền gửi" → Lưu → lưới 3 cột → tải lại vẫn 3 cột → Sửa mẫu → Lấy mẫu ngầm định → 4 cột | AC-21 | header cột trước/sau | `t0106-06..08-*.png` |

Kết quả 2026-09-18: **13/13 PASS**.

## Chưa kiểm ở đây

- **Đối chiếu MShopKeeper** (tín hiệu thành công): cần cùng bộ chứng từ trên hai hệ thống; làm
  tay tại G4 với một chi nhánh + một kỳ thật, ghi ảnh hai bên vào `evidence/`.
- **AC-07 trên UI** (chế độ Chuỗi cộng mọi chi nhánh): đã kiểm ở e2e (`180.000` khi không gửi
  `branchId`); UI chế độ Chuỗi của admin test chưa chụp.
- **Chân bảng "Tổng 0 0 0"** của `ReportPageTable` cho báo cáo `totals: null` — thẩm mỹ, ngoài
  AC, follow-up chung với Kết quả kinh doanh.

## Steps — UOW-02 (Bảng kê thu chi)

Cùng môi trường; mỗi script in PASS/FAIL từng bước và thoát khác 0 khi có lỗi.

| Script | Kiểm | Verifies | Kết quả 2026-09-18 | Evidence |
|---|---|---|---|---|
| `verify-t0203.py` | dialog Nhân viên / Phương thức / Kỳ / Từ–Đến; lưới 14 cột mặc định (Mã đối tượng, Số hóa đơn ẩn); dòng Số dư đầu kỳ 1.500.000, 9 phiếu, luỹ kế cuối 3.770.000, chân bảng 2.670.000 / 400.000; lọc cột Diễn giải "Tiền điện" → 2 dòng; Chuyển khoản → 1 dòng, Tiền mặt → 8; Sửa mẫu 16 cột, 2 tắt, 4 ghim; bật Số hóa đơn → cột hiện; ngày chứng từ khớp DB | AC-08, AC-09, AC-10, AC-11 | 18/18 sau T-02-07 (17/18 trước đó — dòng đỏ là ngày lệch) | `t0203-0{1..6}-*.png` |
| `verify-t0204.py` | ô IV Tiền mặt / Tiền gửi của Tình hình thu chi là link, các ô khác không; mở dialog Bảng kê cùng kỳ lọc theo phương thức; đóng dialog không gọi lại API | AC-08 (drill-down) | 14/14 | `t0204-0{1..3}-*.png` |

## Steps — UOW-03 (ba báo cáo chi tiền)

| Script | Kiểm | Verifies | Kết quả 2026-09-18 | Evidence |
|---|---|---|---|---|
| `verify-t0304.py` | #4: Tiền điện 150.000 / Chi khác 40.000 / Tiền nước 10.000, Tổng 200.000, Sửa mẫu có ID/Loại mục chi ẩn; #5: TỔNG CHI đậm, dòng nhóm đậm, chi tiết thụt lề, 8 dòng phẳng, dialog Nhân viên / PTTT / Mục chi; #6: Ngày → 3 dòng, Tháng → 09/2026, Mục chi = Tiền điện → 150.000 | AC-12, AC-14, AC-16, AC-17 | 26/26 | `t0304-0{1..6}-*.png` |
| `verify-t0305.py` | "Tiền điện" ở #4 → dialog #5 TỔNG CHI 150.000 một nhóm; "Chi khác" → 40.000; 08/09/2026 ở #6 → #5 TỔNG CHI 100.000 hai nhóm; giữ Mục chi đang lọc | AC-13, AC-18 | 22/22 | `t0305-0{1..4}-*.png` |

Phụ đề "Xem theo cửa hàng / Nhân viên" (T-02-06) kiểm riêng khi ticket đóng.

## Ngoài AC — follow-up chung của report-core FE (không sửa trong feature này)

- Ô kiểu `date` được `ReportPageTableView` in nguyên chuỗi `YYYY-MM-DD` (mọi domain, vì
  `toBusinessDate` trả ISO và bảng không định dạng theo `dataType`); MShopKeeper in
  `dd/MM/yyyy`. Một chỗ sửa trong `ReportPageTableView.tsx` cho cả 4+1 domain.
- Chân bảng "Tổng 0 0 0" cho báo cáo `totals: null` (Tình hình thu chi, Kết quả kinh doanh).
- Tên mục chi trong phụ đề drill-down #6 là "đang lọc" thay vì tên thật (DrillDownContext
  không có nhãn option).
