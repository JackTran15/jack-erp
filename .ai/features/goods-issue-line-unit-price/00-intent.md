---
feature: goods-issue-line-unit-price
slug: goods-issue-line-unit-price
owner: Akenzy
created: 2026-08-22
status: draft
---

# Intent — Đơn giá theo từng dòng trên phiếu xuất kho

## Problem

Trên **Thêm mới phiếu xuất kho**, người dùng nhập hai dòng cùng một mã hàng ở hai mức giá
khác nhau (DD780 — 30 × 350.000 và 60 × 340.000). Sau khi bấm **Lưu**, cả hai dòng hiển thị
cùng một đơn giá `342.941`. Người dùng đọc con số này là "hệ thống tự phân bổ lại giá", và
mất khả năng ghi nhận hai mức giá trên cùng một phiếu.

Con số `342.941` không phải bình quân của 350.000 và 340.000 (bình quân gia quyền 30/60 là
343.333). Nó là **giá vốn bình quân tức thời của DD780 trên toàn chi nhánh**:
`GoodsIssueService.post()` ghi đè đơn giá client gửi lên bằng
`StockLedgerService.getInstantAverageCost(itemId, org, branch)` — một giá duy nhất cho mỗi
`itemId`, tính bằng `Σ line_value / Σ quantity` trên toàn bộ sổ kho của chi nhánh. Giá người
dùng gõ bị vứt đi hoàn toàn, không lưu ở đâu.

Đây là hành vi cố ý của module `goods-issue` (`goods-issue.service.ts:426-429`:
*"Cost on a goods issue is never client-supplied"*), nhưng nó **lệch chuẩn so với hai module
chứng từ kho anh em**, cả hai đều đã tôn trọng giá người dùng nhập:

| Module | Đơn giá dòng | Hành vi hiện tại |
|---|---|---|
| `goods-receipt` (Phiếu nhập) | giá người dùng nhập | giữ nguyên, ghi sổ đúng bằng nó (`:814`, `:1275`) |
| `transfer/stock-transfer` (Chuyển kho nội bộ) | giá người dùng nhập, rỗng thì bình quân | `l.unitPrice != null ? l.unitPrice : costByItemId.get(itemId) ?? 0` (`:375-376`, `:557-559`) |
| `goods-issue` (Phiếu xuất) | **luôn ghi đè** bằng bình quân chi nhánh | `post():282-315`, `update():426-437` |

Kèm theo là hai chỗ **mất danh tính dòng** khi một phiếu có hai dòng trùng `(itemId, locationId)`:

- `goods-issue.service.ts:456-460` + `:524-540` — `beforeByKey` khoá theo `${itemId}::${locationId}`
  nên chỉ dòng cuối sống sót, rồi vòng re-price gán **cùng một đơn giá** cho mọi dòng chung khoá.
- `transfer-order.service.ts:669-670` — chân nhập ở chi nhánh đích khớp dòng phiếu xuất bằng
  `candidate.itemId === line.itemId`, luôn lấy dòng đầu tiên.

Tầng tính chênh lệch sổ kho thì **không hỏng**: `voucher-delta.util.ts:62-88` đã cộng gộp
đúng cả hai phía trước khi so sánh.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
|---|---|---|
| Thủ kho / nhân viên kho | Nhập 2 mức giá cho cùng mã hàng, lưu xong thấy cả hai về một số lạ; không hiểu số đó ở đâu ra | Hai dòng giữ đúng 350.000 và 340.000 sau khi lưu, in ra và mở lại vẫn đúng |
| Kế toán kho | Giá vốn xuất kho luôn là bình quân chi nhánh, không đặt được | Giá vốn xuất kho theo đúng đơn giá nhập tay trên từng dòng; bỏ trống thì hệ thống tự lấy bình quân |
| Chi nhánh nhận (điều chuyển) | Nhận về theo một dòng gộp | Nhận đúng từng dòng với đúng đơn giá chân xuất, giá trị hai đầu cân bằng tuyệt đối |

## Success signal

Lưu lại đúng kịch bản trong báo lỗi #19 — phiếu xuất mục đích *Điều chuyển đến cửa hàng khác*,
hai dòng DD780 (30 × 350.000 và 60 × 340.000) cùng kho KHO SG — rồi mở lại phiếu:
hai dòng vẫn là **350.000** và **340.000**, thành tiền **10.500.000** và **20.400.000**,
và phiếu nhập sinh ra ở chi nhánh đích mang đúng hai dòng với đúng hai mức giá đó.
Đồng thời `SUM(stock_ledger_entries.line_value)` của phiếu bằng đúng **30.900.000** (INV-2).

## Out of scope

- **Backfill dữ liệu cũ.** Giá người dùng nhập trên các phiếu đã lưu đã bị ghi đè và không
  còn tồn tại ở bất kỳ cột nào trong DB — không thể khôi phục. Phiếu cũ giữ nguyên giá vốn
  đã ghi sổ; sổ kho và báo cáo lịch sử không đổi.
- **Đổi ý nghĩa cột `unit_price` thành hai cột riêng (giá bán / giá vốn).** Người dùng đã chốt
  giá nhập tay *là* giá vốn ghi sổ, nên vẫn một cột như `goods-receipt` và `stock-transfer`.
- **Cơ chế xử lý chênh lệch giá vốn.** Xuất dưới/trên giá vốn bình quân sẽ để lại phần chênh
  trong `inventory_value` của tồn còn lại. Ghi nhận là hệ quả đã biết (xem A-01), không giải
  quyết bằng bút toán TK632 trong feature này.
- **Phiếu do hệ thống tự sinh** (POS, kho tạm, xếp kệ, kiểm kê) — chúng không gửi `unitPrice`
  nên rơi vào nhánh fallback và giữ nguyên hành vi cũ.

## Constraints

| Kind | Detail |
|---|---|
| Kế toán | INV-1/INV-2/INV-3 của feature `warehouse-voucher-edit-delete` phải tiếp tục đúng: `SUM(line_value)` theo `reference_id` bằng đúng giá trị dòng phiếu hiện tại |
| Sổ bất biến | Không `UPDATE`/`DELETE` dòng `stock_ledger_entries` hay `journal_entries` nào; sửa phiếu vẫn ghi bút toán chênh lệch |
| Tương thích ngược | Dòng không gửi `unitPrice` (hoặc gửi 0) phải giữ nguyên hành vi bình quân hiện tại — nếu không sẽ làm chết mọi phiếu tự sinh |
| Báo cáo | `inventory-reports/services/{transfer-report,stock-period,document-detail}.service.ts` đọc `goods_issue_lines.unit_price` như giá vốn — ý nghĩa cột không đổi, nên không cần sửa |
| Chuẩn repo | Đi theo đúng khuôn `stock-transfer.service.ts` đã có, không phát minh cơ chế mới |
| Deadline | Chưa có |

## Existing surface touched

- **Reused pattern:** `stock-transfer.service.ts:375-376` (`unitPrice ?? averageCost`) là khuôn mẫu;
  `voucher-delta.util.ts` dùng nguyên, không sửa.
- **Adjacent features:** `warehouse-voucher-edit-delete` (sở hữu INV-1/2/3 và đường sửa phiếu),
  `goods-issue-source-warehouse` (sở hữu `location_id` theo dòng).
- **Entry points:** không có route mới. `POST /goods-issues`, `POST /goods-issues/:id/post`,
  `PATCH /goods-issues/:id`, và chân nhập của `transfer-order`.
- **Frontend:** `GoodsIssueFormDialog.tsx` đã cho nhập và đã gửi `unitPrice` lên — không cần sửa
  để đạt mục tiêu chính; chỉ rà lại prefill (`:641`, `:1126-1132`, `:1183-1191`).
