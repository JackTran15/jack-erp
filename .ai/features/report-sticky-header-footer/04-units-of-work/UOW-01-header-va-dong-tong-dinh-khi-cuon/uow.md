---
id: UOW-01
slug: header-va-dong-tong-dinh-khi-cuon
title: Header và dòng Tổng dính khi cuộn bảng báo cáo
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-05, AC-06, AC-07]
risk: low
status: todo
rollback: revert; chỉ là style và một phép đo trong component. Không migration, không đổi API, không đổi dữ liệu lưu của người dùng (cấu hình cột, ghim cột nằm ở `table-store`, không bị chạm)
---

# UOW-01 — Header và dòng Tổng dính khi cuộn bảng báo cáo

Một lát cắt duy nhất, vì ba mảnh việc bên trong không demo riêng được: một header dính mà
dòng Tổng chưa dính thì vẫn là màn hình dở dang, và bộ helper tự nó không hiện lên màn hình.
Cắt nhỏ hơn nữa sẽ ra đúng cái mà AI-DLC gọi là lát ngang.

Lát này chạm đúng một component, nên nó hưởng lợi cho cả ~20 báo cáo chain-store cùng lúc —
`ReportPageTableView` là bảng dùng chung của mọi báo cáo trong `/reports/*`.

AC-04 cố tình **không** nằm trong `verifies` của lát này: đổi chiều rộng cột chỉ làm được bằng
cách kéo tay nắm resize, mà ngữ pháp tương tác của bộ chạy không có động từ kéo. T-01-02 vẫn
`verifies: [AC-04]` nên độ phủ AC không thủng — xem `## Not verified here` trong
`07-verification.md` để biết bằng chứng thật là gì.

## Demo script

1. Đăng nhập backoffice, mở **Báo cáo → Bán hàng**, chọn **Chi tiết doanh thu theo hóa đơn
   và mặt hàng**, chọn một kỳ có dữ liệu rồi bấm **Lấy dữ liệu** cho tới khi bảng có ít nhất
   50 dòng
2. Cuộn dọc xuống giữa bảng → hàng tiêu đề cột và hàng ô lọc vẫn nằm ở đỉnh, hàng **Tổng**
   vẫn nằm ở đáy; cả hai trong cùng một khung hình
3. Vẫn ở vị trí đó, cuộn ngang hết cỡ → cột **Ngày** dính mép trái và các cột khác trượt qua
   *phía dưới* nó, ở cả ba vùng
4. Kéo hẹp một cột cho nhãn xuống dòng → hàng tiêu đề cao thêm, hàng ô lọc tụt xuống theo,
   không hở khe
5. Mở **Báo cáo → Bán hàng → Danh sách hóa đơn và đơn hàng** (báo cáo có group header) →
   cuộn dọc, cả ba tầng header đều dính, xếp liền nhau
6. Mở **Báo cáo → Lợi nhuận → Kết quả kinh doanh** (không có dòng Tổng) → cuộn dọc, header
   vẫn dính, không lỗi
7. Quay lại báo cáo chi tiết doanh thu, chọn một kỳ **không có dữ liệu** (vd 01/2025) → bảng
   rỗng nhưng hàng **Tổng** vẫn nằm sát đáy vùng cuộn, ngay trên thanh phân trang, và vùng
   trống ở giữa không có đường kẻ nào

## In scope

- `withStickyTop` / `withStickyBottom` trong `lib/table/report-table-pinning.ts`
- Đo chiều cao hai hàng header đầu bằng `useLayoutEffect` + `ResizeObserver`
- Bỏ `rowSpan={2}` và không render `<tr>` tầng 2 khi báo cáo không có group
- Sticky cho ba hàng header, cho `<tfoot>`, và `isolate` cho vùng cuộn
- Lấp đầy chiều cao bảng để hàng Tổng dính đáy cả khi bảng ngắn hoặc rỗng (T-01-04)
- Gỡ các class `z-*` nay đã bị inline style thay thế (kể cả prop `pinned` của `FilterHeaderCell`)

## Not in scope

- `PosDataTable` (pos-web) và ~8 dialog table dùng `border-collapse` — xem `00-intent.md`
- Virtualization, đổi layout/spacing header, đổi hành vi kéo-thả cột

## Risks

| Risk | Mitigation |
|---|---|
| `ResizeObserver` gọi `setState` → vẽ lại → `ResizeObserver` lại chạy | So sánh giá trị trước khi `setState`; `setState` chỉ đổi `top` nên không đổi chiều cao của chính hai `<tr>` đang quan sát. Console không được có cảnh báo `ResizeObserver loop` |
| dnd-kit đổi thứ tự cột trong lúc header đang sticky | `SortableHeaderCell` vốn đã cố tình không áp `transform` (`:22-23`) vì lý do sticky; lát này không đụng tới nó. Demo bước 3 vẫn phải kéo-thả được |
| Gỡ class `z-*` mà quên một chỗ | Gỡ và thay trong cùng ticket, không tách. Ô của thân bảng (`z-10`) **giữ nguyên** — đó là mức đáy của thang ở ADR-02 |
| Đổi `rowSpan` làm vỡ báo cáo có group | Nhánh có group giữ nguyên `rowSpan={2}`; chỉ nhánh `!hasGroups` đổi. Demo bước 5 là bằng chứng |

## Definition of done
- [x] AC-01..AC-07 pass
- [x] `pnpm --filter @erp/backoffice-web build` xanh (lớp UI này không có test tự động)
- [x] Không còn class `z-*` chết ở header / filter / footer của `ReportPageTableView`
- [x] Console không có cảnh báo `ResizeObserver loop completed with undelivered notifications`
- [x] Demo được chấp nhận ở G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
