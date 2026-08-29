---
feature: 2026082801-warehouse-report-filters-audit
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Bộ lọc nhóm Báo cáo > Kho

Mọi số đo trên `erp_dev`, chi nhánh **Hồ Chí Minh**, kỳ **Hôm nay** — đúng chi nhánh tài khoản
backoffice đáp xuống và đúng kỳ mặc định của nhóm Báo cáo Kho. Ở chế độ một chi nhánh lưới
không tự tải, nên mọi bước đều mở "Chọn báo cáo" rồi bấm "Đồng ý".

Số nền: "Tổng hợp nhập xuất tồn kho" không lọc = **53 kết quả**; nhóm cha "GIÀY DÉP" = **50**,
đúng bằng tổng ba nhóm lá của nó.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Lưới nền: không lọc, 53 kết quả | `/reports/inventory?v=s1#inventory_in_out_stock_summary` | `click button:has-text("Chọn báo cáo"); click button:has-text("Đồng ý")` | AC-02 | `text=trên 53 kết quả` |
| S2 | Nhóm cha "GIÀY DÉP" trả 50 dòng, không phải 0 | `/reports/inventory?v=s2#inventory_in_out_stock_summary` | `click button:has-text("Chọn báo cáo"); click input[placeholder="Tất cả nhóm"]; click [role="option"]:has-text("GIÀY DÉP"); click button:has-text("Đồng ý")` | AC-01, AC-03, AC-04 | `text=trên 50 kết quả; no-text=trên 0 kết quả` |
| S3 | Thương hiệu thu hẹp đúng ở báo cáo có khai dòng đó | `/reports/inventory?v=s3#stock_quantity_by_store` | `click button:has-text("Chọn báo cáo"); click [role="combobox"]:has-text("Tất cả"); click button:has(span:text-is("Giay MT")); click button:has-text("Đồng ý")` | AC-07 | `text=trên 1 kết quả` |
| S4 | Đổi báo cáo thì thương hiệu biến mất, không lọc ngầm | `/reports/inventory?v=s4#stock_quantity_by_store` | `click button:has-text("Chọn báo cáo"); click [role="combobox"]:has-text("Tất cả"); click button:has(span:text-is("Giay MT")); click button:has-text("Đồng ý"); click button:has-text("Chọn báo cáo"); click [role="combobox"]:has-text("Số lượng tồn kho theo cửa hàng"); click button:has(span:text-is("Tổng hợp nhập xuất tồn kho")); click button:has-text("Đồng ý")` | AC-05, AC-06 | `text=trên 53 kết quả; no-text=trên 1 kết quả` |
| S5 | Cột luôn rỗng bỏ hẳn ô lọc, cột bên cạnh vẫn có | `/reports/inventory?v=s5#warehouse_voucher_detail_list` | `click [role="combobox"]:has-text("Hôm nay"); click button:has(span:text-is("Tháng này")); click button:has-text("Lấy dữ liệu"); wait tbody tr; scroll th:has-text("Tên cửa hàng nhận")` | AC-09 | `text=trên 18 kết quả; count [aria-label="Lọc Mã cửa hàng"] = 0; count [aria-label="Lọc Mã cửa hàng nhận"] = 0; count [aria-label="Lọc Tên cửa hàng"] = 1` |
| S6 | Lọc theo cột chạy thật, không ra lỗi | `/reports/inventory?v=s6#inventory_in_out_stock_summary` | `click button:has-text("Chọn báo cáo"); click button:has-text("Đồng ý"); fill input:below(:text-is("Mã SKU")) = ABA2777` | AC-08, AC-10 | `no-text=không hỗ trợ lọc trên báo cáo này; text=ABA2777` |
| S7 | Hạt "Mẫu mã": lọc cột Mã SKU chạy, không còn 400 | `/reports/inventory?v=s7#inventory_in_out_stock_summary` | `click button:has-text("Chọn báo cáo"); click [role="combobox"]:has-text("Hàng hóa"); click button:has(span:text-is("Mẫu mã")); click button:has-text("Đồng ý"); fill input:below(:text-is("Mã SKU")) = ABA2777` | AC-13 | `no-text=không hỗ trợ lọc trên báo cáo này; text=ABA2777` |
| S8 | Hạt "Mẫu mã": cột rỗng bỏ hẳn ô lọc, cột có số thì giữ | `/reports/inventory?v=s8#inventory_in_out_stock_quantity_detail` | `click button:has-text("Chọn báo cáo"); click [role="combobox"]:has-text("Hàng hóa"); click button:has(span:text-is("Mẫu mã")); click button:has-text("Đồng ý"); wait tbody tr` | AC-14 | `count [aria-label="Lọc Thương hiệu"] = 0; count [aria-label="Lọc Đơn vị tính"] = 0; count [aria-label="Lọc Mã SKU"] = 1` |
| S9 | Hạt "Nhóm hàng hóa": lọc cột đo "Tồn cuối kỳ" chạy | `/reports/inventory?v=s9#stock_quantity_by_store` | `click button:has-text("Chọn báo cáo"); click [role="combobox"]:has-text("Hàng hóa"); click button:has(span:text-is("Nhóm hàng hóa")); click button:has-text("Đồng ý"); wait tbody tr; fill input:below(:text-is("Tồn cuối kỳ")) = 20` | AC-12 | `no-text=không hỗ trợ lọc trên báo cáo này; text=trên 1 kết quả; text=Giày nam` |

## Not verified here

- **AC-11** (cache không trộn phạm vi chi nhánh) — cần **hai** tài khoản cùng tổ chức khác phân
  công chi nhánh gọi trong vòng 45 giây; một phiên trình duyệt không dựng lại được. Phủ bằng
  5 test khoá cache trong `report-data.util.spec.ts` (T-04-01).
Hai tiêu chí của hạt gộp từng khai ở đây khi T-05-04 chưa xong; nay S8 và S9 chụp được nên
chúng đã chuyển lên bảng bước.

## Notes

- **Mỗi bước phải mang một `?v=` khác nhau.** Hai URL chỉ khác phần `#hash` thì `page.goto`
  không tải lại tài liệu, SPA không remount, và `ReportPage` — vốn chỉ đọc hash **lúc mount** —
  giữ nguyên báo cáo của bước trước. Lượt chạy đầu dính đúng bẫy này: bước khai
  `#warehouse_voucher_detail_list` lại chụp lưới của báo cáo trước đó.
- **Option của `SingleSelect` là `<button>` thuần, không có `role="option"`.** Nó là Radix
  *Popover*, không phải Radix Select (`packages/ui/src/components/single-select.tsx:56`).
  Và `:text-is()` khớp phần tử **nhỏ nhất** mang đúng chuỗi đó — tức cái `<span class="truncate">`
  bên trong, không bao giờ là `<button>`. Nên dạng đúng là `button:has(span:text-is("…"))`:
  vẫn khớp chính xác (dữ liệu có cả "Giay MT" lẫn "Giày MT", cả "Tất cả" lẫn "Tất cả ĐVT") mà
  click đúng vào nút. `TreeSelectInput` thì khác — nó tự đánh `role="option"`, dùng thẳng được.
- **Chỉ một viewport.** Backoffice xoay refresh token nên phiên đã lưu **dùng được đúng một
  lần**: chạy hai viewport thì lượt thứ hai bị đá về `/login` ở cả 7 bước. Chiều cao 720 vẫn
  đáng xem bằng tay (popover lọc ~450px, nút "Đồng ý" nằm dưới cùng), nhưng dựng nó ở đây chỉ
  tạo ra bảy dòng đỏ không nói lên điều gì về tính năng.
- **`fill` không nhận selector chứa `=`.** `verify.py:413` tách bằng regex non-greedy nên cắt
  ngay dấu `=` đầu tiên, tức là ở giữa `[aria-label="…"]`. Dùng selector layout
  `input:below(:text-is("Mã SKU"))` — không có `=`, và cũng không phụ thuộc thứ tự cột (thứ tự
  bị mẫu cột đã lưu đổi, nên `nth-child` là bẫy).
- **S5 đổi kỳ sang "Tháng này" và cuộn ngang.** Ở kỳ "Hôm nay" báo cáo này trả 0 dòng, và hai
  cột "Mã cửa hàng" nằm ngoài khung nhìn — hai khẳng định `count` vẫn đúng (chúng đọc DOM), nhưng
  tấm ảnh thì không cho thấy điều nó khẳng định, đúng loại bằng chứng vô nghĩa mà bộ này tồn tại
  để tránh. Cuộn tới "Tên cửa hàng nhận" đưa cả cụm cửa hàng vào khung hình: đọc được ngay rằng
  hai cột "Tên …" có ô lọc còn hai cột "Mã …" thì không.
- **`wait tbody tr` là bắt buộc sau "Lấy dữ liệu".** Không có nó, ảnh chụp trúng lúc lưới còn
  rỗng và chân trang ghi "0 kết quả" trong khi API trả 18 — trông y hệt một lỗi mà thực ra chỉ
  là chụp sớm. `settle()` của runner là `networkidle`, mà TanStack Query bắn request ở tick sau
  nên networkidle đã true trước khi có gì bay đi. Đo tay: 1,5s sau cú bấm là đã có đủ 18 dòng.
- **S9 lọc `= 20`, không phải 17.** "Số lượng tồn kho theo cửa hàng" **không** nằm trong
  `SINGLE_MODE_HEADER_STORE_REPORTS` của `inventory-report-v2.api.ts`, nên FE không gán `store`
  và backend suy phạm vi từ `actor.branchIds` — tức **cả hai** chi nhánh, chứ không phải chi
  nhánh ở header. Nhóm "Giày nam" vì thế là 20 (hai chi nhánh) chứ không phải 17 (một). Đo con
  số cho báo cáo này thì phải đo **không** kèm `store`.
- `viewports` gồm `laptop` (1440×720) vì bảng lọc là popover ~450px; ở chiều cao đó nút
  "Đồng ý" là thứ đầu tiên bị đẩy khỏi khung nhìn — mà cả 7 bước đều kết thúc bằng nút ấy.
