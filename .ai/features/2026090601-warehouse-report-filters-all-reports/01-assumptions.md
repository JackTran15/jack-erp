---
feature: warehouse-report-filters-all-reports
blocking_open: 0
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | N1: ở hạt gộp, "Đơn vị tính"/"Thương hiệu" nghĩa là **lọc thành viên trước khi gộp** — vị từ vào `WHERE` của CTE gộp, nhóm vẫn hiện nhưng số đo chỉ gồm hàng khớp | high | no | Nếu người dùng muốn "nhóm nào CÓ ít nhất một hàng khớp thì hiện ĐỦ số" thì vị từ phải thành `EXISTS` bán liên kết, khác hẳn SQL | confirmed | Akenzy chọn 2026-09-06: "Lọc thật theo thành viên — vị từ vào WHERE trước khi GROUP BY. Nhóm vẫn hiện, nhưng số liệu chỉ gồm hàng khớp." |
| A-02 | N2: "Số lượng tồn kho theo cửa hàng" là báo cáo **tồn tại thời điểm hiện tại** theo thiết kế, nên cách sửa là **gỡ** hai dòng lọc kỳ khỏi form, không phải cho nó tôn trọng kỳ | high | no | Nếu người dùng thật sự cần tồn theo thời điểm quá khứ thì phải viết lại engine pivot trên ledger — một feature khác | confirmed | Akenzy chọn 2026-09-06: "Gỡ hai dòng lọc kỳ khỏi form". Engine đọc stock balance, không có khái niệm kỳ (`stock-balance-pivot.service.ts`); đo được: 5/5 kỳ khác nhau đều 9639 dòng. |
| A-03 | N3: 3 báo cáo transfer-detail phải **lọc thật** theo `columnFilters`, không phải ẩn ô lọc | high | no | Nếu ẩn: rẻ hơn nhiều, nhưng dialog mất khả năng lọc | confirmed | Akenzy chọn 2026-09-06: "Nối cho lọc thật — truyền `columnFilters` xuống `TransferDetailService.detail()` / `summarizeByCounterpart()` và cấp spec cho các cột có thật." |
| A-04 | Ba conflict khi cherry-pick `1cb20a60` lên `main` đều **máy móc**, không có xung đột thiết kế | high | no | Nếu có xung đột thiết kế thật thì UOW-01 nở từ "gỡ conflict" thành "thiết kế lại pivot" | confirmed | Dựng thử trong worktree tạm 2026-09-06: 29 file add + 22 modify merge sạch; 3 conflict = `.ai/aidlc.yaml` (vặt) + khối `import` + chữ ký constructor trong `stock-by-store-pivot.report.ts`/spec. Nội dung conflict đã đọc tận mắt. |
| A-05 | Bản sửa D1–D5 tháng 8 vẫn **đúng** với `main` hôm nay, sau `#240`/`#246`/`#248` | medium | no | Nếu sai, một phần UOW-01 phải viết lại thay vì recover | confirmed | Đóng 2026-09-06 (T-01-02 + T-01-03). Test: api 3671 pass / 2 fail (cả hai `auth.service.spec.ts › token TTL`, đỏ sẵn, ngoài vùng feature); backoffice-web 78 pass / 3 fail (cả ba `print-html-document`, không jsdom). Probe trên `:4100` build mới: GIÀY DÉP 0→8918 = đúng tổng 11 nhóm lá, PHỤ KIỆN 0→664, Giày nam giữ 2205, 0 dòng ngoài cây. `#240` không bị nuốt — `stock-by-store-pivot.report.ts` giữ cả `resolveOrgWideBranchIds` (:144,:196) lẫn `resolveDescendantCategoryIds` (:222). |
| A-06 | Ở hạt gộp, `unit`/`brand` lọc trên chính `i.unit`/`i.brand` — cùng biểu thức với hạt item, chỉ khác **vị trí**: bên trong CTE gộp thay vì ngoài | high | no | Đặt sai chỗ (ngoài CTE) thì cột đã NULL sau khi gộp ⇒ lọc luôn trả rỗng | confirmed | Đóng 2026-09-06 (T-02-02). Vị từ đặt trong `item_agg`/`groups` trước `GROUP BY`. Đo trên erp_dev_3008, `statBy=group`: 29 nhóm → 17; nhóm hỗn hợp giảm số mà vẫn > 0 (Dây thắt lưng 1532→371, Túi xách nữ 1267→14, Ví nam 464→113); 12 nhóm toàn ĐVT "Đôi" giữ nguyên số. |
| A-07 | Gỡ `report_period` + `range_date` khỏi registry của pivot **không** phá `buildInitialReportState` — factory vẫn seed hai khoá đó cho mọi báo cáo, chỉ là không render | medium | no | Nếu prune (D2) xoá chúng khỏi túi và một chỗ khác đọc, kỳ mặc định của báo cáo khác có thể rỗng | confirmed | Đóng 2026-09-06 (T-04-02). Đúng: `ALWAYS_KEPT_FILTER_LINES` giữ hai line qua prune — test round-trip (A → pivot → A) cho thấy kỳ của A còn nguyên. **Nhưng kéo theo một vế thiết kế sai**: vì túi vẫn giữ kỳ và `buildInventorySearchFilters` đọc vô điều kiện, gỡ registry KHÔNG làm payload sạch `period`/`preset` như mục *Contracts* của 03-logical-design khẳng định. Vá bằng `PERIODLESS_REPORTS` ở tầng payload; xem T-04-02. |
| A-08 | `TransferDetailService` nhận thêm `columnFilters` mà không phá `transfer-catalog-parity.spec.ts` | medium | no | Nếu spec parity khoá chữ ký, phải sửa spec cùng lượt | confirmed | Đóng 2026-09-06 (T-05-01/03). `transfer-catalog-parity.spec.ts` xanh sau khi `detail()` và `summarizeByCounterpart()` nhận thêm `columnFilters`; parity khoá catalog, không khoá chữ ký. |
| A-09 | N4 (`countSql` hạt gộp thiếu `JOIN branches b`) là **lỗi**, không phải hành vi ai đó đang dựa vào | high | no | Nếu có báo cáo/đối soát đang ăn theo con số phồng, sửa xong số tổng sẽ giảm và trông như hồi quy | confirmed | Đóng 2026-09-06 (T-03-02). Là lỗi, và cherry-pick UOW-01 đã sửa sẵn. Đo live: total = dòng duyệt được ở cả 3 hạt (24/4/3), chân trang khớp tổng dòng. Lưu ý: trên erp_dev_3008 bug KHÔNG tái hiện được (0/7 chi nhánh không phân giải), nên rào là test hình dạng SQL — đột biến gỡ 2 dòng bắt được 4 test. Ghi chú phát hành đã viết trong ticket. |
| A-10 | Người dùng nói "check all các báo cáo kho" nghĩa là **cả 11** loại backend (8 trong dropdown + 3 drill-down), không chỉ 8 loại chọn được | medium | no | Nếu chỉ 8: UOW cho N3 thừa | confirmed | Đóng 2026-09-06 (T-06-01): quét cả 11 loại × 3 hạt, 33/33 trả 201. Ba loại drill-down đúng là nơi N3 nằm, và 43 cột của chúng nay lọc thật — chỉ làm 8 loại thì N3 vẫn còn. |

## Ghi chú nguồn

- **A-01/A-02/A-03** — trả lời trực tiếp của Akenzy, 2026-09-06, sau khi được trình cả phương án
  thay thế và cái giá của từng phương án.
- **A-04** — `git cherry-pick --no-commit 1cb20a60` trong worktree tách rời; nội dung từng khối
  conflict đã in ra đọc, không suy từ số lượng.
- **A-06** — `stock-period.service.ts:515` truyền `withText = isItemLevel`; ở hạt gộp
  `buildAggSqls` (`:665`) chọn `displayCols` (`:714-733`) trong đó `unit`/`brand` là
  `NULL::text` (`:747`, `:735`). Nên vị từ phải nằm trong CTE, trước khi hai cột đó bị NULL hoá.
- **A-09** — `transfer-report.service.ts`: câu trang `:845-859` có
  `JOIN branches b ON b.id = ia.other_branch_id AND b.organization_id = $1` (INNER, loại dòng),
  câu đếm `:860-869` là `FROM item_agg ia WHERE TRUE ${filterWhere}`.
