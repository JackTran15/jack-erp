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

## UOW-02 / UOW-03

Bổ sung khi các ticket FE (T-02-03, T-03-04) và drill-down (T-02-04, T-03-05) đóng: cùng
script, thêm các bước cho Bảng kê thu chi (lọc cửa hàng / nhân viên / phương thức, cột ẩn),
ba báo cáo chi tiền và hai drill-down.
