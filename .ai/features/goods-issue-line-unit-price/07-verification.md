---
feature: goods-issue-line-unit-price
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Đơn giá theo từng dòng trên phiếu xuất kho

Ba phiếu dựng sẵn trên `erp_dev`, mỗi phiếu là một trạng thái mà một AC mô tả. Lưới **Chi tiết**
ở đáy màn `Kho → Xuất kho` là chỗ lỗi #19 hiện ra, vì nó có cột **Đơn giá** theo từng dòng.

Mỗi bước bấm số phiếu rồi **đóng dialog xem** ngay sau đó. Dialog bật lên che đúng hai cột
Đơn giá và Thành tiền — bỏ bước đóng thì assertion vẫn xanh nhờ lưới phía dưới, nhưng tấm ảnh
không cho người đọc thấy điều nó đang khẳng định, tức là bằng chứng giả.

Mỗi bước khẳng định **cả con số đúng lẫn con số sai**: dưới hành vi cũ dòng thứ hai bị định giá
lại theo giá vốn bình quân chi nhánh (ở dữ liệu dev là `350.000`), nên `no-text=` chính là chỗ
phân biệt bản đã sửa với bản chưa sửa. Thiếu nó thì một bản hỏng vẫn xanh.

S2 là ngoại lệ và không có `no-text=`: con số phân biệt ở đó lẽ ra là `0`, nhưng `0.00` xuất hiện
11 chỗ khác trên cùng trang, nên một `no-text=0.00` sẽ đỏ vĩnh viễn vì lý do chẳng liên quan gì
tới AC-03. Thay vào đó `text=1.750.000` (= 5 × 350.000) đã đủ: thành tiền đó chỉ ra được nếu đơn
giá đã được giải, vì 5 × 0 không bao giờ bằng 1.750.000.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | XK000017 giữ đúng hai đơn giá trên hai dòng cùng mã hàng | `/inventory/goods-issues` | `click text=XK000017; click text=Đóng; wait text=Đơn giá` | AC-01 | `text=350.000; text=340.000; text=10.500.000; text=20.400.000; no-text=21.000.000` |
| S2 | XK000018 bỏ trống đơn giá được điền bằng giá vốn, không phải 0 | `/inventory/goods-issues` | `click text=XK000018; click text=Đóng; wait text=Đơn giá` | AC-03 | `text=350.000; text=1.750.000` |
| S3 | XK000019 sửa số lượng xong, mỗi dòng vẫn giữ đơn giá riêng | `/inventory/goods-issues` | `click text=XK000019; click text=Đóng; wait text=Đơn giá` | AC-05 | `text=350.000; text=340.000; text=10.500.000; text=17.000.000; no-text=20.400.000` |

## Not verified here

Những AC dưới đây là **bất biến trong sổ kho hoặc trong dữ liệu**, không có mặt trên màn hình
nào — chụp ảnh không chứng minh được chúng, và một ảnh chụp "màn hình vẫn đẹp" sẽ bị đọc nhầm
thành bằng chứng. Chúng được kiểm bằng thứ đọc thẳng `stock_ledger_entries`:

- **AC-02** — `Σ line_value = −30.900.000` sau khi ghi sổ. Kiểm bởi e2e `goods-issue-roundtrip.e2e-spec.ts`
  (T-01-03), chạy trên Postgres thật.
- **AC-04** — đơn giá âm bị từ chối. Kiểm bởi `dto/goods-issue-line.dto.spec.ts` (T-01-02) và e2e
  cùng file trên; ValidationPipe chặn trước khi có gì để chụp.
- **AC-06** — INV-1/INV-2 sau khi sửa, và sổ chỉ được ghi thêm chứ không sửa dòng cũ. Kiểm bởi e2e
  (T-02-04), đối chiếu `posted_at` của mọi dòng cũ trước/sau.
- **AC-07, AC-08, AC-12** — đơn giá stamp trên **bút toán chênh lệch**, không phải trên dòng phiếu.
  Kiểm bởi unit test (T-02-03). AC-12 đặc biệt không chụp được: nó khẳng định `unitCost` là số dẫn
  xuất `|valueDelta / quantityDelta|` = 390.000, một con số không xuất hiện trên bất kỳ dòng phiếu nào.
- **AC-09, AC-10** — cần **hai chi nhánh** và một actor riêng cho chi nhánh đích; `actor.branchId`
  lấy từ JWT nên một phiên đăng nhập không đi được cả hai đầu. Kiểm bởi e2e hai chi nhánh (T-03-04)
  và unit test (T-03-03).
- **AC-11** — khoá hành vi phiếu **do hệ thống tự sinh**, thứ theo định nghĩa không có ai bấm nút.
  Kiểm bởi `transfer-order.auto-export.spec.ts` và `stock-take.service.spec.ts` (T-04-01).

## Notes

**Fixture không idempotent.** Ba phiếu XK000017/18/19 đã ghi sổ thật trên `erp_dev` và không thể
tạo lại cùng số. Chạy lại `verify.py` trên máy khác, hoặc sau khi `erp_dev` bị reset, phải dựng lại
fixture rồi sửa số phiếu trong bảng trên. Các phiếu này rút tồn `ABA2777-D-42` xuống âm — chấp nhận
được trên dev, và hệ thống cho phép tồn âm.

**API phải là bản của chính checkout này.** `:4000` trên máy dev đang chạy từ worktree
`object-by-branch`, tức là **code cũ** — kiểm trên đó sẽ thấy cả hai dòng về `350.000` và đọc nhầm
thành lỗi chưa sửa. Verification chạy với API riêng ở `:4001` của checkout này, và backoffice `:3000`
được trỏ sang nó bằng `VITE_API_BASE_URL=http://localhost:4001`:

```bash
PORT=4001 pnpm --filter @erp/api dev
VITE_API_BASE_URL=http://localhost:4001 pnpm --filter @erp/backoffice-web dev
```

**Phải mint phiên trước mỗi lần chạy: `.ai/verify-stack.sh session`.** Đây là cách đi vòng
quanh một lỗi đua **trong runner**, không phải sai cấu hình ở đây. `perform_login()` submit form
rồi gọi `settle()` (chờ networkidle, trần 5s) và **ngay lập tức** hỏi trang còn ở route đăng nhập
không. Đo trên app này: tại đúng thời điểm đó networkidle đã true và URL vẫn là `/login`; **500 ms
sau** mới thành `/`. Phép kiểm rơi trúng khe đó và báo *"credentials were rejected"* cho một lượt
đăng nhập thật ra đã thành công. Có sẵn phiên thì runner thấy phiên sống ngay ở request landing,
không vào nhánh login, không có đua. Refresh token xoay vòng nên phiên chỉ dùng được **một lần**.

Kèm theo, recipe `form` **không có** selector cho ô "ID tổ chức", mà form này bắt buộc có nó —
`VITE_DEV_ORG_ID` trong `verify-stack.sh` làm giá prefill thành đúng org, nếu không thì lượt
đăng nhập gửi đi org mặc định `e60e5f49-…` và bị từ chối thật.

**Tài khoản.** Chạy bằng tài khoản quản trị ở chi nhánh **Hồ Chí Minh** — fixture nằm ở chi nhánh đó,
và `post_login` trong `.ai/aidlc.yaml` đã chuyển chi nhánh sau khi đăng nhập.
