---
feature: cash-voucher-category-options
adr_count: 2
---

# Logical design — cash-voucher-category-options

## Approach

Một danh sách đích, ba nơi áp dụng:

1. **Org tạo mới** — sửa `DEFAULT_CASH_VOUCHER_CATEGORIES` thành bảng bên dưới (T-01-01). Seeder service không đổi.
2. **Org đang có** — migration dữ liệu `1789930000000-BackfillCashVoucherCategoryOptions` chép bảng dưới dạng literal
   và chạy set-based trên mọi org trong `organizations`, theo thứ tự (T-01-02, ADR-01):
   1. đổi tên 2 mục, chỉ khi tên còn là tên mặc định cũ;
   2. đánh lại `display_order` cho các mã có thứ tự đổi, chỉ khi giá trị còn là mặc định cũ;
   3. chèn mọi mục trong 43 mục mà org chưa có mã (tính cả dòng đã xoá mềm) và chưa có mục cùng loại trùng tên.
3. **Dropdown** — `useCashVoucherCategories` gửi `sortBy=displayOrder&sortOrder=asc`; 4 dialog phiếu thu/chi hiện
   theo đúng thứ tự báo cáo Kết quả kinh doanh vốn đã dùng (T-01-03, ADR-02).

### Danh sách đích

Mục thu không đổi gì. Mục chi: 14 mục mới, 2 mục đổi tên, 15 mục đổi `display_order`.

| display_order | Mã | Tên | Loại | Thay đổi |
| --- | --- | --- | --- | --- |
| 1 | `THU_BAN_HANG` | Thu từ bán hàng | IN | — |
| 2 | `THU_KHAC` | Thu khác | IN | — |
| 3 | `THU_THANH_LY_TS` | Thu thanh lý tài sản | IN | — |
| 4 | `THU_BAN_PHE_LIEU` | Thu từ bán phế liệu | IN | — |
| 5 | `THU_HOAN_UNG` | Thu hoàn ứng | IN | — |
| 6 | `THU_CH_KHAC` | Thu từ cửa hàng khác chuyển đến | IN | — |
| 7 | `THU_TIEN_MAT_NHAP_QUY` | Thu nhận tiền mặt về nhập quỹ | IN | — |
| 8 | `THU_TIEN_GUI_NH` | Thu nhận tiền gửi vào ngân hàng | IN | — |
| 9 | `THU_NO_KH` | Thu nợ khách hàng | IN | — (hệ thống, không có trong ảnh) |
| 10 | `CHI_TIEN_DIEN` | Tiền điện | OUT | — |
| 11 | `CHI_TIEN_DIEN_THOAI` | Tiền điện thoại | OUT | — |
| 12 | `CHI_TIEN_INTERNET` | Tiền internet | OUT | — |
| 13 | `CHI_TIEN_NUOC` | Tiền nước sinh hoạt | OUT | đổi tên, cũ "Tiền nước" |
| 14 | `CHI_THUE_CUA_HANG` | Tiền thuê cửa hàng | OUT | — |
| 15 | `CHI_TIEN_VAN_CHUYEN` | Tiền vận chuyển | OUT | **mới** |
| 16 | `CHI_DUNG_CU_SUA_DEP` | Mua dụng cụ sửa dép | OUT | **mới** |
| 17 | `CHI_LUONG` | Tiền lương | OUT | 15 → 17 |
| 18 | `CHI_THUONG` | Tiền thưởng | OUT | 16 → 18 |
| 19 | `CHI_PHU_CAP` | Tiền phụ cấp | OUT | 17 → 19 |
| 20 | `CHI_UNG_LUONG` | Ứng lương | OUT | **mới** |
| 21 | `CHI_CCDC` | Mua đồ dùng, công cụ, dụng cụ | OUT | đổi tên, cũ "Công cụ dụng cụ"; 18 → 21 |
| 22 | `CHI_TSCD` | Tài sản cố định | OUT | 19 → 22 |
| 23 | `CHI_MAY_MOC_THIET_BI` | Mua máy móc thiết bị | OUT | **mới** |
| 24 | `CHI_KHAC` | Chi khác | OUT | 20 → 24 |
| 25 | `CHI_TIEP_KHACH` | Chi tiếp khách | OUT | 21 → 25 |
| 26 | `CHI_VAN_PHONG_PHAM` | Mua văn phòng phẩm | OUT | 22 → 26 |
| 27 | `CHI_TAM_UNG` | Chi tạm ứng | OUT | 23 → 27 |
| 28 | `CHI_THUE_MUON_KHAC` | Thuê mướn khác | OUT | **mới** |
| 29 | `CHI_VE_SINH_MOI_TRUONG` | Chi vệ sinh môi trường | OUT | **mới** |
| 30 | `CHI_LY_DO_KHAC` | Chi lý do khác | OUT | **mới** |
| 31 | `CHI_MUA_HANG` | Chi mua hàng hóa | OUT | 24 → 31 |
| 32 | `CHI_CHUYEN_TIEN_CH` | Chi chuyển tiền sang cửa hàng khác | OUT | 25 → 32 |
| 33 | `CHI_RUT_TIEN_GUI` | Rút tiền gửi về nhập quỹ | OUT | 26 → 33 |
| 34 | `CHI_GUI_TIEN_NH` | Chi gửi tiền vào ngân hàng | OUT | 27 → 34 |
| 35 | `CHI_AN_UONG` | Chi ăn uống | OUT | **mới** |
| 36 | `CHI_XANG_DAU_NHOT` | Mua xăng dầu nhớt | OUT | **mới** |
| 37 | `CHI_NAP_VETC` | Nạp VETC | OUT | **mới** |
| 38 | `CHI_LAM_HANG` | Làm Hàng | OUT | **mới** |
| 39 | `CHI_DO_DUNG_VE_SINH` | Đồ dùng vệ sinh | OUT | **mới** |
| 40 | `CHI_TIEN_AN` | Tiền ăn | OUT | **mới** |
| 41 | `CHI_TIEN_NUOC_UONG` | Tiền nước uống | OUT | **mới** |
| 42 | `CHI_NO_NCC` | Chi trả nợ nhà cung cấp | OUT | 28 → 42 (hệ thống, không có trong ảnh) |
| 43 | `BANK_FEE` | Phí ngân hàng | OUT | 29 → 43 (hệ thống, không có trong ảnh) |

Mã dài nhất `CHI_VE_SINH_MOI_TRUONG` = 22 ký tự (giới hạn 32).

## Alternatives rejected

| Option | Why not |
| --- | --- |
| Chỉ sửa seed constant | Org đang dùng và prod không thấy mục mới — tiền lệ `BANK_FEE` ở My Company (A-03) |
| Gọi `seedForOrganization` cho mọi org lúc app khởi động (`OnModuleInit`) | Chạy mỗi lần boot và đồng thời trên nhiều instance; không nằm trong lịch sử migration; seeder không đổi tên hay thứ tự |
| Migration import `DEFAULT_CASH_VOUCHER_CATEGORIES` | Lần sửa constant sau sẽ âm thầm đổi nghĩa một migration đã chạy; tiền lệ `BackfillDefaultCoaAccounts` giữ literal |
| Lặp từng org như `BackfillDefaultCoaAccounts` | 43 × số org câu lệnh; `INSERT … SELECT FROM organizations` cho cùng kết quả với 43 câu |
| Thêm mục mới, giữ "Tiền nước" / "Công cụ dụng cụ" | Dropdown có hai mục gần trùng (A-04) |
| UPDATE tên/thứ tự vô điều kiện | Đè chỉnh sửa org đã làm trên màn danh mục |
| Sắp xếp phía client trong 4 dialog | 4 chỗ sửa thay vì 1 hook; API generic đã hỗ trợ `sortBy` |
| Thêm cột nhóm cha | Không được yêu cầu; đổi schema và UI dropdown (A-02) |

## Domain model

Không đổi. `CashVoucherCategoryEntity`: `code varchar(32)`, `name varchar(255)`, `direction` IN/OUT, `is_active`,
`display_order int`, `deleted_at`; UNIQUE `(organization_id, code)` là constraint thường, **tính cả dòng đã xoá mềm**.

## Contracts

Không đổi API, không regenerate api-client. Request mới của dropdown:

```
GET /admin/entities/cash-voucher-categories/records
    ?page=1&pageSize=100&sortBy=displayOrder&sortOrder=asc&filters={"direction":"OUT"}
```

`sortBy` / `sortOrder` đã có trong `PaginationQueryDto` và `operations["CrudController_listRecords"]`.

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| Danh sách mục theo org | bảng `cash_voucher_categories` | Vĩnh viễn; org sửa qua `/admin/cash-voucher-categories` |
| Danh sách mặc định cho org mới | `DEFAULT_CASH_VOUCHER_CATEGORIES` | Theo mã nguồn |
| Danh sách cho dropdown | TanStack Query, `treasuryQueryKeys.cashVoucherCategories(direction)` | `staleTime` 5 phút |

## Error taxonomy

| Condition | Where | Behaviour |
| --- | --- | --- |
| Lỗi SQL giữa chừng | `migration:run` | `migrationsTransactionMode: 'each'` ⇒ rollback cả migration, không có trạng thái nửa vời; deploy dừng |
| Org đã có mã, kể cả đã xoá mềm | INSERT | NOT EXISTS ⇒ bỏ qua, không vỡ UNIQUE (A-08) |
| Org đã có mục cùng loại trùng tên, khác mã | INSERT | Bỏ qua (A-06) |
| Org đã sửa tên hoặc thứ tự | UPDATE | Không khớp điều kiện giá trị cũ ⇒ giữ nguyên (AC-03) |
| Hai mục cùng `display_order` (org tự đặt) | Dropdown | Thứ tự giữa hai mục không xác định; không lỗi |
| Một loại có hơn 100 mục | Hook, `pageSize: 100` | Mục thứ 101 trở đi không hiện — hiện có tối đa 34 mục chi mặc định; không xử lý trong plan này |

## Observability

Không thêm log hay metric. Kiểm bằng SQL đếm mục theo org × loại trước và sau migration (Demo script bước 2 và 4).

## ADRs

### ADR-01 — Bổ sung org đang có bằng migration dữ liệu: literal cố định, set-based, UPDATE có điều kiện, `down()` no-op
**Context:** Seeder chỉ chạy lúc tạo org (tiền lệ `BANK_FEE`). Org trên prod có thể đã sửa danh mục qua màn quản trị.
UNIQUE `(organization_id, code)` tính cả dòng đã xoá mềm.
**Decision:** Migration `1789930000000-BackfillCashVoucherCategoryOptions` chạy trên mọi org: đổi tên → đánh lại thứ
tự (mỗi UPDATE chỉ khớp giá trị mặc định cũ) → chèn 43 mục nếu chưa có mã và chưa có mục cùng loại trùng tên.
`down()` không làm gì.
**Consequences:** Org cũ và org mới có cùng danh sách. Org đã tuỳ biến giữ phần đã sửa, nên thứ tự có thể là
"lai". Mục mặc định thiếu từ trước (`BANK_FEE`) cũng được lấp. Không revert bằng `migration:revert`; rollback dữ
liệu làm trên màn danh mục.
**Status:** accepted — Akenzy chọn "Migration bổ sung" và "Đổi tên tại chỗ", 11/09/2026

### ADR-02 — Dropdown sắp theo `display_order` tại hook dùng chung
**Context:** API generic mặc định sắp theo `createdAt`; `display_order` đã là thứ tự dòng 2.2/3.2 của báo cáo Kết
quả kinh doanh.
**Decision:** `useCashVoucherCategories` gửi `sortBy=displayOrder&sortOrder=asc`.
**Consequences:** 4 dialog và báo cáo cùng một thứ tự. Org đổi thứ tự trên màn danh mục thì dropdown đổi theo.
**Status:** accepted — Akenzy chọn "Theo thứ tự ảnh", 11/09/2026
