# Intent — stock-by-store-branch-scope

## Problem

Khách hàng rà soát Phụ lục 01 (mục **PQ-02**, `docs/client/phu-luc-01-checklist.csv:33`) báo:
trên báo cáo **Số lượng tồn kho theo cửa hàng**, Quản lý chi nhánh và Nhân viên vẫn xem được
số liệu của các chi nhánh khác. Đây là báo cáo kho duy nhất lộ toàn chuỗi — 7 báo cáo kho còn
lại đã hiển thị đúng phạm vi.

**Đo trên dữ liệu thật (org MT), tài khoản gán đúng 2 chi nhánh (MT46 + MT211 = 35.150):**

| Đường (code trước khi sửa) | Quản lý chi nhánh / Nhân viên kho thấy gì |
|---|---|
| **legacy** `GET /reports/inventory/stock-by-branch` | **tổng toàn tập 263.340** — toàn bộ tổ chức, không có điều kiện chi nhánh nào |
| **v2** `POST /reports/inventory/search` | 2 cột = đúng `actor.branchIds`, tổng 35.150 |

Đường legacy truyền `branchIds` thẳng từ query string vào engine
(`inventory-reports.service.ts:133`) và engine đọc mảng rỗng là "không lọc chi nhánh"
(`stock-balance-pivot.service.ts:232`). Trang `/reports/storage/*` không bao giờ gửi `branchIds`,
nên mọi người có `inventory.reports.read` đều đọc được tồn kho toàn công ty qua URL trực tiếp —
`routeAccess.ts:26` trả `allow` cho route không gắn nav.

**Chốt của chủ dự án (03/09/2026):** riêng báo cáo này, **mọi vai trò mở được báo cáo đều được xem
toàn bộ chi nhánh** — đây là báo cáo so sánh tồn kho giữa các cửa hàng, cắt phạm vi thì mất công
năng. Vậy phạm vi dữ liệu org-wide của đường legacy là **đúng ý**; cái sai là đường v2 đang kẹp
theo `actor.branchIds`, và bản thân endpoint legacy thì không có chốt chặn nào cả nên phải xoá.

**Điểm cần khách xác nhận:** quyết định này **ngược với câu chữ PQ-02** khách viết ("Quản lý chi
nhánh và NV vẫn có quyền để xem được toàn chuỗi, xem được số liệu của các chi nhánh khác"). Nhân
viên kho đứng ở một chi nhánh sẽ thấy tồn kho cả 15 chi nhánh. Đã ghi vào
`docs/client/phu-luc-01-checklist.csv`.

## Success signal

- Tài khoản **Quản lý chi nhánh** và **Nhân viên kho** (mỗi người gán 2 chi nhánh) mở Báo cáo →
  Kho → *Số lượng tồn kho theo cửa hàng* thấy **đủ cột của mọi chi nhánh trong tổ chức**, tổng
  bằng đúng tổng toàn tập — giống hệt tài khoản Quản trị.
- `GET /reports/inventory/stock-by-branch` và `/reports/storage/stock-by-branch` không còn tồn tại;
  mọi truy cập đi qua `POST /reports/inventory/search` (vẫn gác `inventory.reports.read`).
- 7 báo cáo kho còn lại giữ nguyên phạm vi cũ — không nới theo.

## Out of scope

- Báo cáo **lợi nhuận** và **công nợ**: đang **cố ý** cho Quản lý chi nhánh xem xuyên chi nhánh
  (ghi chú tại `org-role-permissions.ts:74-76`). PQ-02 đã nêu cần khách xác nhận riêng — không
  đụng trong feature này.
- 7 báo cáo kho còn lại: giữ nguyên phạm vi hiện tại. Nới org-wide **chỉ** áp cho
  `inventory-stock-by-store-pivot`.
- Tổng quát hoá chốt chặn chi nhánh cho toàn bộ điểm gọi `@RequireBranchScope` (rủi ro sót mà
  PQ-02 nêu). Feature này chỉ đóng một báo cáo cụ thể + xoá đường legacy của nhóm báo cáo kho.
- Màn hình quản trị nhiều công ty (PQ-06), tự khởi tạo công ty (PQ-07).

## Constraints

- Không có thay đổi schema, nên không có migration (`synchronize: false`).
- Chốt chặn phải nằm ở **server**: FE chỉ là tiện lợi, không phải ranh giới bảo mật.
- `RbacModule` là `@Global()`, nên `RbacService` inject được vào `inventory-reports` mà không
  cần import thêm module (docblock `inventory-reports.module.ts:64`).
- Xoá endpoint ⇒ phải chạy lại `pnpm openapi:generate` và commit `openapi.snapshot.json` +
  `packages/api-client/src/generated/schema.ts`.
- Mọi chuỗi hiển thị là tiếng Việt; giá trị enum/ID giữ tiếng Anh.
