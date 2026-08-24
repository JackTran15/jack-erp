---
feature: pos-employee-picker-branch-scope
environments: [local-pos]
viewports: [desktop, laptop]
---

# Verification — Branch-scope hai picker nhân viên trong POS

Chạy bằng tài khoản `LOCAL_POS_*` = `admin@erp.local`, vai trò **Quản trị hệ thống**, trong
`erp_dev`. Đây là tài khoản duy nhất chứng minh được tính năng, và đã kiểm bằng SQL chứ không
đoán:

```sql
SELECT bool_or(p.key = 'iam.user.read.all')
FROM users u JOIN user_roles ur ON ur.user_id = u.id
JOIN role_permissions rp ON rp.role_id = ur.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE u.email = 'admin@erp.local';   -- t
```

Chạy bằng tài khoản thường thì `EmployeeBranchScopeService` đã thu hẹp sẵn, cả hai màn "đã đúng"
từ trước khi sửa, và mọi bước dưới đây sẽ xanh kể cả khi bản vá bị revert — bằng chứng đẹp mà
không chứng minh gì.

Chi nhánh ghim theo `${LOCAL_POS_BRANCH_ID}` = **HCM**. Mọi con số trong cột `Assert` lấy từ
`erp_dev`, không phải đọc trên UI rồi chép lại:

```sql
-- 10 user active gán HCM  → 10 dòng picker NVC, và 10 + 1 ô "Tất cả thu ngân" = 11
SELECT count(*) FROM users u WHERE u.is_active AND EXISTS (
  SELECT 1 FROM user_branch_assignments uba
  WHERE uba.user_id = u.id AND uba.branch_id = '<HCM>');            -- 10
-- 6 trong số đó có hồ sơ HR → 6 + 1 ô "Tất cả NVBH" = 7
SELECT count(*) FROM employee_profiles e JOIN users u ON u.id = e.user_id
WHERE EXISTS (SELECT 1 FROM user_branch_assignments uba
              WHERE uba.user_id = u.id AND uba.branch_id = '<HCM>');  -- 6
-- 4 user active KHÔNG thuộc HCM: Inventory Admin, Kho Test, Thu ngân Test, X Test
```

Thứ tự picker là `first_name, last_name, id`, nên danh sách HCM chạy từ **Admin User** (1) tới
**Thu ngân HCM** (10). Hai mốc đó là thứ khoá được bằng chứng phân trang, xem S6/S7.

## ⚠ `pageSize` bị hạ xuống 3 khi chụp bằng chứng phân trang

HCM chỉ có 10 người, mà bản ship dùng `TEMP_WAREHOUSE_CARRIERS_PAGE_SIZE = 20` — trang 2 không
bao giờ tồn tại, nên AC-05 không thể chụp được với cấu hình thật trên dữ liệu này (rủi ro A-07
đã ghi từ G1). Đã chốt với người dùng: **tạm đặt page size = 3 trong lúc chạy evidence, rồi trả
lại 20**. S6 và S7 là hai bước duy nhất phụ thuộc vào việc đó, và ảnh của chúng **không phải**
ảnh của cấu hình sẽ ship.

Đổi lại, phép đếm trở nên sắc: với page size 3, thứ tự trên cho biết **QuanLyCN** (thứ 6) chỉ
xuất hiện sau 2 lần xin trang, và **Thu ngân HCM** (thứ 10) chỉ sau 4 lần. Không có cách nào
thấy hai cái tên đó mà không phân trang.

Lần chạy đầu cho biết effect auto-fill dừng ở **6 dòng**, không phải 9: `renderMeta` làm mỗi
dòng cao hai hàng, nên 6 dòng đã tràn khung 288px. Vì vậy S6 chốt ở mốc 6 (tự nạp), còn S7 phải
cuộn **hai lần** mới tới dòng thứ 10. Đây là số đo, không phải suy đoán.

Cũng vì page size 3 mà S1 không còn khẳng định được "đúng 10 dòng" — mốc đó chuyển sang S7
(`count = 10` sau khi cuộn hết) và S9 (`11` ô, gồm ô "Tất cả thu ngân"). S1 chỉ còn khẳng định
danh sách mở ra đã có người của HCM và không có người ngoài HCM.

Các bước tìm kiếm chờ trên **dòng kết quả cụ thể** (`wait li[role="option"]:has-text(...)`) chứ
không chờ `li[role="option"]` chung: danh sách chưa lọc đã có sẵn từ lúc focus nên điều kiện
chung thoả ngay lập tức, và assertion chạy trước khi lượt tìm sau debounce 150ms kịp về. Lần
chạy đầu S4 đỏ đúng vì lý do đó — đếm được 6 dòng chưa lọc, không phải lỗi tính năng.

Chưa đủ: dòng được chờ còn phải **nằm ngoài 6 dòng auto-fill đầu tiên**, nếu không điều kiện chờ
lại thoả ngay từ danh sách chưa lọc. Vòng hai S2 và S4 đỏ đúng vì thế — cả hai chờ "NV Kho HCM",
mà người này đứng thứ 3. Nên S2 tìm **Thu ngân HCM** (thứ 10) và S4 tìm mã **NV000002** của
**Sales HCM** (thứ 9): hai cái tên chỉ có thể xuất hiện sau khi lọc thật sự chạy.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Ô "Người vận chuyển" mở ra đã có sẵn nhân viên chi nhánh HCM, không còn rỗng | `/pos/fast-stock-transfer` | `click input[aria-label="Người vận chuyển"]; wait li[role="option"]` | AC-01 | `text=Admin User; text=Bán hàng Test; no-text=Kho Test` |
| S2 | Tìm theo tên thu hẹp đúng người | `/pos/fast-stock-transfer` | `click input[aria-label="Người vận chuyển"]; fill input[aria-label="Người vận chuyển"] = ngân; wait li[role="option"]:has-text("Thu ngân HCM")` | AC-02 | `text=Thu ngân HCM; count li[role="option"] = 1` |
| S3 | Tìm theo email ra đúng một người | `/pos/fast-stock-transfer` | `click input[aria-label="Người vận chuyển"]; fill input[aria-label="Người vận chuyển"] = cashier@gmail.com; wait li[role="option"]:has-text("Thu ngân HCM")` | AC-03 | `text=Thu ngân HCM; count li[role="option"] = 1` |
| S4 | Tìm theo **mã nhân viên**, và mã hiện trên dòng để thấy vì sao nó khớp | `/pos/fast-stock-transfer` | `click input[aria-label="Người vận chuyển"]; fill input[aria-label="Người vận chuyển"] = NV000002; wait li[role="option"]:has-text("Sales HCM")` | AC-04 | `text=Sales HCM; text=NV000002; count li[role="option"] = 1` |
| S5 | Nhân viên chi nhánh khác không lọt vào danh sách | `/pos/fast-stock-transfer` | `click input[aria-label="Người vận chuyển"]; fill input[aria-label="Người vận chuyển"] = Kho Test` | AC-07 | `text=Không có kết quả.; count li[role="option"] = 0` |
| S6 | Page size 3: effect auto-fill tự nạp cho tới khi đầy khung — **QuanLyCN** (thứ 6) chỉ có sau 2 trang | `/pos/fast-stock-transfer` | `click input[aria-label="Người vận chuyển"]; wait li[role="option"]:nth-child(6)` | AC-05 | `text=QuanLyCN; count li[role="option"] = 6` |
| S7 | Cuộn hai lần nạp nốt hai trang cuối — **Thu ngân HCM** (thứ 10) chỉ có sau 4 trang, và không dòng nào lặp | `/pos/fast-stock-transfer` | `click input[aria-label="Người vận chuyển"]; wait li[role="option"]:nth-child(6); scroll li[role="option"]:last-child; wait li[role="option"]:nth-child(9); scroll li[role="option"]:last-child; wait li[role="option"]:nth-child(10)` | AC-05 | `text=Thu ngân HCM; count li[role="option"] = 10` |
| S8 | Chọn được người vận chuyển, tên hiện đúng trên ô | `/pos/fast-stock-transfer` | `click input[aria-label="Người vận chuyển"]; fill input[aria-label="Người vận chuyển"] = NV000003; wait li[role="option"]; click li[role="option"]` | AC-13 | `no-text=Không có kết quả.` |
| S9 | Bộ lọc "Thu ngân" chỉ còn nhân sự HCM — 10 người + ô "Tất cả thu ngân" | `/pos/daily-report` | `click button:has-text("Tất cả thu ngân"); wait [role="listbox"]` | AC-08 | `text=NV000003 - Thu ngân HCM; no-text=Thu ngân Test; no-text=Kho Test; count [role="listbox"] [role="option"] = 11` |
| S10 | Bộ lọc "NVBH" chỉ còn 6 nhân sự HCM có hồ sơ HR + ô "Tất cả NVBH" | `/pos/daily-report` | `click button:has-text("Tất cả NVBH"); wait [role="listbox"]` | AC-09 | `text=NV000002 - Sales HCM; no-text=Thu ngân Test; count [role="listbox"] [role="option"] = 7` |
| S11 | Picker dùng chung **không** truyền `loadMore` vẫn cắt ở 8 gợi ý | `/pos/` | `click input[placeholder*="Nhập tên hàng hóa"]; fill input[placeholder*="Nhập tên hàng hóa"] = Dép nam; wait li[role="option"]` | AC-12 | `count li[role="option"] = 8` |

## Not verified here

- **AC-10** (403 khi `branchId` ngoài `actor.branchIds`) không có bề mặt UI: POS chỉ gửi chi
  nhánh của chính token nó. Chứng minh bằng spec trong `get-report-filter-options.handler.spec.ts`
  — reviewer đã mutation-test: bỏ bước đối chiếu thì đúng hai case đó đỏ.
- **AC-06** (đổi chi nhánh thì danh sách đổi theo) đã thử và phải bỏ: bước đổi chi nhánh gọi
  `/auth/switch-branch`, cấp **token mới** rồi `window.location.reload()`. Session đã lưu của bộ
  chạy thành cũ ngay lúc đó, nên không chỉ bước ấy đỏ — mọi bước sau nó, và cả viewport chạy sau,
  đều "redirected to sign-in". Một bước tự phá phần còn lại của lần chạy thì tệ hơn là không có
  bước đó. Cách chụp được AC-06 là chạy lần thứ hai với `LOCAL_POS_BRANCH_ID` trỏ sang chi nhánh
  khác rồi đối chiếu hai bộ ảnh — nằm ngoài thứ một file kế hoạch làm được, cần người quyết.
  Ở tầng code, AC-06 dựa trên `TEMP_WAREHOUSE_KEYS.CARRIERS` có `branchId` trong query key
  (reviewer T-01-03 đã xác nhận cache tách theo chi nhánh).
- **AC-11** (báo cáo chuỗi ở backoffice vẫn org-wide) cần môi trường `local-backoffice`, nhưng
  `verify.py` chạy **mọi bước trên mọi môi trường** — bảng Steps không có cột env — nên một kế
  hoạch không thể vừa đi route POS vừa đi route backoffice. Chứng minh bằng: spec "omitting
  branchId leaves the consolidated scope untouched", và việc caller backoffice
  (`chain-store/reports/_api/report-filter-options.api.ts`) gửi `branchIds` số nhiều cho
  `type=warehouse`, không bao giờ gửi `branchId`. Reviewer đã grep xác nhận.
- **Nửa sau của AC-12** — "không phát request nào khi cuộn" — là một *sự vắng mặt*, ảnh chụp
  không nói được. S11 chụp được nửa trước: giới hạn 8 gợi ý vẫn còn nguyên ở một call site không
  truyền `loadMore`. Nửa sau chứng minh bằng cấu trúc: `onScroll` là `undefined` khi không có
  `loadMore` — reviewer đã kiểm cả 12 call site.
- **Phần hydrate của AC-13** (thêm dòng, tải lại, dòng vẫn hiện đúng tên) cần chọn thêm hàng hóa
  và kho, vượt quá bộ 4 động tác của DSL. Đã chốt với người dùng: chỉ chụp tới lúc chọn được
  người vận chuyển. Đường resolve id→tên không đổi trong feature này (`upsertCarriers` /
  `getCarrierById` giữ nguyên) và `carrierUserId` vẫn là `users.id`, cả hai đã được review xác nhận.
- **Ô "Nhân viên" ở panel bàn giao ca** dùng lại đúng `useReportFilterOptionsQuery("cashier")`
  của S9, nên S9 đã chứng minh nó; hai select trong panel có cùng nhãn "Nhân viên" nên không
  chọn được bằng một selector không mơ hồ.

## Sharp edge tìm thấy lúc verify — có sẵn, không sửa ở feature này

Tìm theo **họ tên đầy đủ** không ra kết quả khi tên nằm vắt qua hai cột. Backend ILIKE trên
từng cột một (`u.firstName ILIKE :s OR u.lastName ILIKE :s OR …`), không ghép chuỗi, mà dữ liệu
lại lưu `first_name = 'Thu'`, `last_name = 'ngân HCM'` — nên gõ `Thu ngân` khớp **không cột nào**
và dropdown rỗng. Vòng ba S2 đỏ đúng vì lý do đó.

Đây là hành vi có sẵn: query cũ (`ILike` trên ba trường) cũng vậy, và `cashiers()` ở bộ lọc báo
cáo cũng vậy. Nằm ngoài phạm vi feature này, nhưng đáng làm một ticket riêng — người dùng gõ họ
tên đầy đủ là bản năng, và cái họ nhận được là "không có kết quả", đúng cái triệu chứng feature
này vừa đi sửa. S2 vì thế tìm `ngân`, một chuỗi nằm gọn trong một cột, đúng như AC-02 phát biểu
("một phần họ hoặc tên").

## Notes

Route POS có base path `/pos/` (`vite.config.ts`). Cột `Path` phải mang tiền tố đó — viết theo
route của `BrowserRouter` thì dev server trả trang "public base URL of /pos/" và mọi bước đỏ với
lý do không liên quan gì tới tính năng. Lần chạy đầu đã dính đúng lỗi này.

Cả hai màn nằm dưới `PosRequireBranch`, nên không có trạng thái "chưa chọn chi nhánh" để chụp.
