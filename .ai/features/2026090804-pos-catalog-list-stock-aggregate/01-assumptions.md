---
feature: pos-catalog-list-stock-aggregate
blocking_open: 0
---

# Assumption register

Ba câu hỏi phía dưới đã được **repo trả lời**, nên chúng không nằm trong bảng — ghi lại
ở đây để người đọc sau không phải điều tra lại:

- Ai gọi `loadBranchStock`? Đúng ba chỗ: `listProducts` (:153, cả chi nhánh),
  `buildProductDetail` (:413) và `buildItemDetail` (:446) — hai chỗ sau đã truyền
  `itemIds` nên vốn đã hẹp. Chỉ :153 là đường rộng.
- Đường list có đọc `sellableTotal` hay `locations[]` không? Không.
  `PosProductCardDto` không có trường nào cho chúng; `listProducts` chỉ đọc
  `stockByItem.get(id)?.total`.
- Sau thay đổi, `direction` của `loadBranchStock` có còn ai truyền không? Không — hai
  caller còn lại đều truyền `undefined`. Tham số vẫn giữ nguyên, vì ADR-01 cấm chạm.

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | `SUM(quantity)` trong Postgres (numeric) rồi `Number()` một lần cho ra con số mà FE coi là bằng với cách hiện tại (`Number()` từng dòng rồi cộng float trong JS) | high | no | `quantityOnHand` lệch ở chữ số thập phân cuối trên item có nhiều vị trí lẻ; card hiển thị sai vài phần trăm đơn vị | confirmed | Chạy song song hai đường trên `erp_dev_3008`, 15 chi nhánh × 3 direction = 45 tổ hợp: **0 chênh lệch** (ngưỡng 1e-9), tập khoá cũng khớp. Xem `07-verification.md` |
| A-02 | Chưa client nào truyền `direction` vào `GET /catalog/products` | medium | no | Nếu có, nhánh `direction` của truy vấn mới phải đúng ngay lần đầu | confirmed | `useCatalogProductsQuery` (`use-query-catalog.ts:48`) là caller duy nhất của `catalogService.listProducts` và chỉ truyền `page`, `pageSize`, `categoryId`. Tham số vẫn giữ trong hợp đồng và vẫn được test parity trên cả 3 giá trị |
| A-03 | `erp_dev_3008` đủ giống prod để mức cải thiện giữ được ở prod | high | no | Cải thiện thật nhỏ hơn đo được; kết luận về nguyên nhân vẫn đúng vì nó dựa trên hình dạng truy vấn | pending | **Chỉ đóng được sau khi deploy.** Cách đóng: xem lại log `LoggingInterceptor` cho `GET …/catalog/products` và các endpoint bắn cùng lúc lúc POS mở trang, so với dải 700–1000 ms trong `00-intent.md` |
| A-04 | Ngoài POS grid không còn consumer nào của `GET /catalog/products` phụ thuộc vào việc endpoint này đọc `stock_balances` theo cả chi nhánh | high | no | Một hành vi phụ vô tình bị bỏ | confirmed | Chỉ `pos-web` gọi endpoint này; backoffice không gọi. Không có cache nào được hâm nóng bởi lượt đọc đó — `CacheService` chỉ giữ khung thẻ theo org, sinh bởi `buildOrgCards`, không đụng `stock_balances` |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
| --- | --- | --- | --- |
| A-05 | `/catalog/products` đã phân trang `pageSize=30` nên không phải vấn đề — ghi trong "Out of scope" của [[project_pos_catalog_page_load]] | Phân trang chỉ giới hạn **payload trả về**. Phần đọc tồn kho phía server vẫn quét cả chi nhánh (14 015 dòng) bất kể `pageSize`, và đó mới là phần chặn event loop | Chính là lý do feature này tồn tại; đánh giá cũ đúng về payload, sai về chi phí server |
