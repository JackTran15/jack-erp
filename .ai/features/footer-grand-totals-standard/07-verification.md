---
feature: footer-grand-totals-standard
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Chuẩn hoá `totals` + ba bảng POS

Kịch bản 17 bước dưới đây **copy nguyên** từ feature `footer-grand-totals`, giữ nguyên mọi con số.
Riêng cột `Verifies` đã ánh xạ lại sang AC của feature này (bản copy đầu tiên còn mang số AC của đợt
1, trong đó AC-17..AC-20 không tồn tại ở đây): mỗi bước vừa chạy lại một khẳng định của đợt 1
(**AC-03**) vừa chứng minh lưới đang đọc đúng hình dạng `totals` mới (**AC-01**, **AC-04** — consumer
đọc field cũ sẽ ra footer rỗng chứ không ra số đúng).
Đó là cả điểm của nó: retrofit chỉ đổi hình dạng response, nên mọi assert cũ phải xanh y hệt. Một
con số lệch nghĩa là hồi quy thật, không phải assert cũ.

Lát cắt đang kiểm: **UOW-01** — footer "Tổng tiền" của Nhập kho / Xuất kho / Chuyển kho lấy
`totalAmount` do server tính trên toàn tập kết quả lọc.

Con số trong cột `Assert` là **sự thật lấy từ SQL**, không phải con số cũ đọc trên UI:

> Lưu ý: các con số dưới đây được tính **sau khi** đã tạo dữ liệu điều chuyển kiểm thử (xem mục
> "Dữ liệu kiểm thử được tạo thêm"). Lượt điều chuyển đó chuyển 2 đơn vị ra khỏi HCM, nên tồn HCM
> là 2.150 chứ không còn 2.155.

```sql
-- Nhập kho (Kho hàng: purpose <> 'PURCHASE') → 691.778.000 trên 3 phiếu
SELECT SUM((SELECT COALESCE(SUM(l.quantity*l.unit_price),0)
            FROM goods_receipt_lines l WHERE l.goods_receipt_id = gr.id))
FROM goods_receipts gr WHERE gr.purpose <> 'PURCHASE';

-- Chuyển kho (status <> 'CANCELLED') → 700.000 trên 2 phiếu
SELECT SUM((SELECT COALESCE(SUM(l.line_value),0)
            FROM stock_transfer_lines l WHERE l.transfer_id = st.id))
FROM stock_transfers st WHERE st.status <> 'CANCELLED';
```

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Nhập kho: footer "Tổng tiền" bằng đúng tổng SQL của toàn bộ phiếu khớp bộ lọc | `/inventory/purchase-orders` | — | AC-01, AC-03, AC-04 | `text=691.778.000` |
| S2 | Chuyển kho: footer "Tổng tiền" bằng đúng tổng SQL của toàn bộ phiếu chưa huỷ | `/inventory/stock-transfers` | — | AC-01, AC-03, AC-04 | `text=700.000` |
| S3 | Xuất kho: không có phiếu nào — lưới rỗng và **không** hiện dòng tổng giả bằng 0 | `/inventory/goods-issues` | — | AC-03, AC-04 | `text=Chưa có phiếu xuất kho.` |
| S4 | Tổng hợp tồn kho: footer "SL tồn" bằng tổng SQL của toàn bộ 1.540 cặp item-kho (2.150 sau khi tạo dữ liệu điều chuyển) | `/inventory-management` | — | AC-01, AC-03, AC-04 | `text=2.150` |
| S5 | Tổng hợp tồn kho, bấm sang trang cuối (trang 31/1.540 dòng): footer vẫn y nguyên — đây đúng là chỗ lỗi cũ lộ ra | `/inventory-management` | `click [aria-label="Trang cuối"]` | AC-03, AC-04 | `text=2.150` |
| S6 | Báo cáo Hàng hóa xuất kho tạm chạy phân trang server: pager đọc `total` của API, dòng tổng đọc `totals` | `/reports/storage/temporary-issues` | — | AC-01, AC-03, AC-04 | `text=trên 2 kết quả` |
| S7 | Tổng hợp NXT: 1.543 dòng, duyệt được tới trang cuối — trước đây lưới cắt cứng ở 200 dòng | `/reports/storage/stock-summary` | `click [aria-label="Trang cuối"]` | AC-03 | `text=trên 1.543 kết quả` |
| S8 | Tổng hợp NXT ở trang cuối: footer "SL nhập" vẫn là tổng toàn tập (2.201), không phải tổng trang | `/reports/storage/stock-summary` | `click [aria-label="Trang cuối"]` | AC-01, AC-03, AC-04 | `text=2201` |
| S9 | Chi tiết SL nhập xuất tồn cũng chạy phân trang server | `/reports/storage/stock-quantity-details` | — | AC-03 | `text=trên 1.543 kết quả` |
| S10 | Chi tiết chứng từ NXT: 1.534 dòng, tới trang cuối, footer "Giá trị nhập" vẫn là tổng toàn tập | `/reports/storage/stock-document-details` | `click [aria-label="Trang cuối"]` | AC-01, AC-03, AC-04 | `text=692.478.000` |
| S11 | Tổng hợp điều chuyển: footer "Giá trị" nhập/xuất điều chuyển = 700.000 trên dữ liệu điều chuyển liên chi nhánh vừa tạo | `/reports/storage/transfer-summary` | — | AC-01, AC-03, AC-04 | `text=700.000` |
| S12 | Điều chuyển theo chi nhánh: footer "Giá trị xuất" = 700.000, do server tính | `/reports/storage/transfer-by-branch` | — | AC-01, AC-03, AC-04 | `text=700.000` |
| S13 | Tổng hợp NXT, trang cuối: cột "Đang chuyển đi" có footer = 3 — tổng toàn tập, dù dòng mang số đó nằm ở trang khác | `/reports/storage/stock-summary` | `click [aria-label="Trang cuối"]` | AC-03, AC-04 | `text=1.050.000` |
| S14 | Tồn kho theo cửa hàng (pivot): mỗi cột chi nhánh có tổng riêng, cột "Tổng" = 2.152 = 2.150 (HCM) + 2 (CN2) | `/reports/storage/stock-by-branch` | — | AC-01, AC-03, AC-04 | `text=2152` |
| S15 | Pivot ở trang cuối: footer không đổi — cột động vẫn đọc `perBranch.<id>` của server | `/reports/storage/stock-by-branch` | `click [aria-label="Trang cuối"]` | AC-03, AC-04 | `text=2152` |
| S16 | Tổng hợp tồn kho, bật "Trừ số lượng hàng hóa khách đặt": footer "SL tồn" giảm đúng phần giữ chỗ, 2.150 → **2.148** | `/inventory-management` | `click button:has-text("Bộ lọc"); click text=Trừ số lượng hàng hóa khách đặt vào tồn kho; click button:has-text("Đồng ý")` | AC-03, AC-04 | `text=2.148` |
| S17 | Đang ở trang cuối (77/77) rồi mới lọc cột Tên hàng hóa: lưới quay về trang 1, không hiện trang trống | `/reports/storage/stock-summary` | `click [aria-label="Trang cuối"]; fill input[placeholder="Giá trị..."] = Dép` | AC-03 | `text=Hiển thị 1 -` |

## Not verified here

- **AC-01 dạng "đổi trang / đổi số dòng-trang thì footer không đổi"** — không dựng được bằng
  ảnh trên máy này: `erp_dev` cục bộ chỉ có **3** phiếu nhập, **2** phiếu chuyển và **0** phiếu
  xuất, nên mọi cỡ trang đều ra đúng một trang. Ảnh chụp ở đây chứng minh điều mạnh hơn về
  *nguồn số*: footer bằng đúng tổng SQL của toàn tập chứ không phải tổng các dòng đang hiển thị.
  Phần bất biến theo `limit` được khoá bằng unit test — mỗi handler có một test gọi `limit: 1`
  và `limit: 100` rồi khẳng định hai lần trả về cùng `totalAmount`:
  `search-goods-receipts-v2.handler.spec.ts`, `search-goods-issues-v2.handler.spec.ts`,
  `search-stock-transfers-v2.handler.spec.ts`.
  Khi nào chạy trên dataset thật (ảnh người dùng gửi: 14 phiếu, 4.141.161.000) thì bước này mới
  chụp được và nên bổ sung.
- **AC-02** (footer đổi theo filter cột) — cần tập dữ liệu đủ lớn để một điều kiện lọc cắt bớt
  được dòng; trên 3 phiếu thì không phân biệt được. Đã khoá ở mức handler bằng test "applies the
  same filters to the totals query as to the rows query".
- **AC-03, AC-04** — bất biến theo `limit` và chống nhân dòng do join `lines`. Đây là hành vi
  của truy vấn, không có bề mặt UI; chụp màn hình không chứng minh thêm được gì. Đã có unit test.
- **AC-07 (hằng đẳng thức theo kỳ), AC-08 (loại trừ hàng giữ chỗ), AC-09 (dòng sắp nhận về),
  AC-10 (lọc cột dẫn xuất)** — đều là hành vi của truy vấn, đã đối chiếu trực tiếp API ↔ SQL
  (`0 + 2196 − 41 = 2155`) và khoá bằng unit test trong `stock-summary.service.spec.ts`. Ảnh chụp
  chỉ cho thấy được một con số, không phân biệt được các nhánh này.
- **AC-11..AC-21** — thuộc UOW-03..UOW-06, phần frontend chưa chuyển xong.

## Dữ liệu kiểm thử được tạo thêm

`erp_dev` không có điều chuyển liên chi nhánh nào, nên báo cáo 6 và 7 không thể kiểm bằng số thật.
Đã tạo qua chính API mà backoffice gọi (không sửa DB tay), lượt điều chuyển HCM → Chi nhánh 2:

| Bước | Endpoint | Kết quả |
| --- | --- | --- |
| Lệnh điều chuyển | `POST /inventory/transfer-orders` | `LDC000001`, 2 × `ABA2777-D-38` |
| Xác nhận xuất | `POST /inventory/transfer-orders/:id/export` | sinh phiếu xuất `TRANSFER_OUT` |
| Kho nhận ở CN2 | `POST /inventory/storages` | `Kho CN2 (test verify)` |
| Xác nhận nhập | `POST /inventory/transfer-orders/:id/import` | sinh phiếu nhập `TRANSFER_IN` |

Số kiểm chứng sau khi tạo (chi nhánh HCM, kỳ 08/2026):

| Báo cáo | total | totals |
| --- | ---: | --- |
| Tổng hợp điều chuyển | 2 | `qtyIn 2, valueIn 700.000, qtyOut 2, valueOut 700.000, qtyReceived 2, chênh lệch 0` |
| Điều chuyển theo chi nhánh (`pageSize` 1 và 50) | 1 | `outQty 2, outValue 700.000` — không đổi theo cỡ trang |

Chênh lệch nhập-xuất bằng 0 đúng như bất biến "sổ khoẻ" mà báo cáo 6 mô tả.

## Ánh xạ AC → nơi chứng minh

`evidence_check.py` chỉ đọc `run.json` của **chính thư mục này**, nên nó báo FAIL cho mọi AC được
chứng minh ở nơi khác. Đó là hệ quả của việc tách bằng chứng POS (xem Notes), không phải AC nào bị
bỏ. Bảng dưới là chỗ tra cứu:

| AC | Chứng minh ở đâu |
| --- | --- |
| AC-01, AC-03, AC-04 | 17 bước trong file này (`evidence/local-backoffice/desktop/S1..S17.png`) |
| AC-02 | Doc comment của `ReportTotals` / `PaginatedWithTotals` trong `packages/shared-interfaces/src/common/index.ts` — AC về tài liệu, không có bề mặt UI |
| AC-05, AC-06 | `footer-grand-totals-pos` S1 |
| AC-08, AC-09 | `footer-grand-totals-pos` S2, S4 |
| AC-10 | `footer-grand-totals-pos` S3 (Đổi trả hàng), S6 (Lịch sử mua hàng) |
| AC-13, AC-14 | `footer-grand-totals-pos` S5, S7 |
| AC-07 | `footer-grand-totals-pos/09-api-probe.md` (cột `limit` 1/5/100) + unit test ba handler |
| AC-11, AC-12 | Ảnh UI: `footer-grand-totals-pos-pagesize1` — chụp với bản vá tạm đặt cỡ trang = 1 (đã revert, chạy lại 7 bước code ship vẫn xanh). AC-12 còn được probe API xác nhận độc lập (8 / 3 / 5 trang cùng `totals`) |
| AC-15 | Nhánh render `—` tồn tại, nhưng whitelist trạng thái ở server đúng bằng 4 trạng thái có nhãn UI ⇒ không dựng được bằng dữ liệu thật |
| AC-16 | `pnpm build` sạch; `npx jest` 1.940 pass / 1 skip (một suite SIGSEGV do jest worker, chạy riêng 8/8 xanh). Đầu ra lệnh, không phải ảnh chụp |


## Notes

- **Bước POS nằm ở feature riêng.** `verify.py` nhân chéo *mọi* bước với *mọi* environment khai ở
  frontmatter — không khai được environment theo từng bước. Trộn bước backoffice và bước POS vào một
  file nghĩa là mỗi bên sẽ chạy nhầm ở app kia và đỏ hết. Vì vậy bằng chứng POS nằm ở
  `.ai/features/footer-grand-totals-pos/`.

- **Ba mốc của S7–S9 dễ dịch, và đó là bản chất chứ không phải lỗi.** Báo cáo này chạy toàn tổ chức
  (xem gạch đầu dòng dưới), còn `erp_dev` thì có thêm chứng từ mỗi khi ai đó thao tác POS hoặc chạy
  kiểm thử — kể cả một lần chạy verify POS hỏng cũng đủ sinh hoá đơn nháp. Trước khi sửa assert:
  hỏi API con số hiện tại rồi **đối chiếu SQL**, đừng chỉnh cho vừa màn hình.

- **Báo cáo NXT (S7–S9) không scope theo chi nhánh.** Controller cố ý không áp `@RequireBranchScope`
  (đọc được đa chi nhánh, lọc bằng `branchIds` trong body), nên con số của nó là **toàn tổ chức**,
  không phải riêng HCM. Đó là lý do mốc ở đây là 1.542 dòng / 2.200 đơn vị chứ không phải 1.541 /
  2.198 như bản đối chiếu SQL scope theo chi nhánh: chênh đúng +1 dòng và +2 đơn vị của phiếu nhập
  điều chuyển tạo ở Chi nhánh 2. Tạo thêm chứng từ kiểm thử sẽ làm các mốc này dịch — tính lại từ
  API rồi đối chiếu SQL, đừng sửa assert cho vừa.

- **Phiên đăng nhập phải được gieo sẵn chi nhánh HCM.** Bước `post_login` trong `.ai/aidlc.yaml`
  bấm đổi chi nhánh qua UI, nhưng lựa chọn đó **không sống sót** qua lần `window.location.reload()`
  ngay sau đó: `active_branch_id` trong phiên đã lưu quay về `396e4d41…` ("Chi nhánh kiểm thử",
  chi nhánh đầu trong `branchIds` của tài khoản), nên mọi bước rơi vào một chi nhánh rỗng và
  chứng minh sai. Đây nhiều khả năng là lỗi thật của app, không riêng harness — đã tách việc
  điều tra riêng.

  Cách chạy được cho tới khi lỗi đó được sửa — gieo phiên đã gắn HCM rồi mới chạy verify:

  ```bash
  # login → switch-branch(HCM) → ghi refresh_token + active_branch_id vào .ai/.auth/local-backoffice.json
  # rồi: python3 .claude/skills/ai-dlc-verify/scripts/verify.py .ai/features/footer-grand-totals --write
  ```

  Refresh token **xoay vòng sau mỗi lần dùng**, nên phải gieo lại trước *mỗi* lần chạy; dùng lại
  phiên cũ sẽ ra "redirected to sign-in".

- Chạy bằng `admin@erp.local`, chi nhánh **HCM** (`LOCAL_BACKOFFICE_BRANCH_NAME`). Toàn bộ 3 phiếu
  nhập và 2 phiếu chuyển trong `erp_dev` đều thuộc chi nhánh này.
- Nhập kho ở menu Kho hàng loại trừ `purpose = 'PURCHASE'` (menu Mua hàng mới hiện loại đó), nên
  truy vấn đối chiếu ở trên phải có cùng điều kiện. Hiện `erp_dev` không có phiếu `PURCHASE` nào.
- Định dạng số là `vi-VN`, dấu phân cách hàng nghìn là dấu chấm.
