# Requirements — pos-catalog-search-perf

Số đo nền (baseline) đều lấy trên `erp_dev_3008`, org `e60e5f49-304d-4eb1-9735-3a2d10ba288f`,
chi nhánh `64f44dbe-35d7-49ef-b98e-85c3437cf47b` (Nha Trang): 41 718 item,
21 024 item POS-visible, 41 714 mã vạch, 164 481 dòng `stock_balances`.

## US-01 — Thu nhỏ số request cho một lần gõ

> Là thu ngân, khi tôi gõ vào ô tìm hàng, tôi muốn máy chỉ hỏi server **một** lần,
> để dropdown gợi ý hiện ra không phải chờ hai chặng nối tiếp.

**AC-01** — Một lần gõ chỉ phát một request
```gherkin
Given ô tìm hàng POS checkout đang trống
When thu ngân gõ chuỗi "235" và chờ hết debounce
Then đúng 1 request rời trình duyệt tới /pos/branches/:id/catalog/search
And không có request nào tới /pos/branches/:id/catalog/lookup
And không có request nào tới /pos/branches/:id/catalog?search=
```

**AC-02** — Khớp tuyệt đối vẫn auto-add đúng một lần
```gherkin
Given một item có mã vạch "8938505974194" tồn tại ở chi nhánh
When thu ngân quét mã đó vào ô tìm hàng
Then endpoint trả exact ≠ null với đúng item đó
And item được thêm vào giỏ đúng 1 lần
And dropdown gợi ý không mở
And quét lại chính mã đó lần thứ hai thì số lượng lên 2 (guard claimRef không chặn nhầm)
```

**AC-03** — Đường Enter không bị minChars chặn
```gherkin
Given minChars của ô tìm hàng là 3
When thu ngân gõ "2" rồi nhấn Enter
Then vẫn có 1 request tới /catalog/search với mode chỉ tra khớp tuyệt đối
And nếu không khớp thì rơi về addProductByQuery như cũ
```

## US-02 — Cắt khối lượng dữ liệu trả về

> Là thu ngân trên máy quầy, tôi muốn dropdown hiện ngay, không phải chờ trình duyệt
> tải và parse vài megabyte để hiển thị 8 dòng.

**AC-04** — Payload đường gợi ý có trần
```gherkin
Given catalog chi nhánh có 10 394 item khớp "2"
When gọi GET /catalog/search?q=235&view=suggest&limit=20
Then response chứa tối đa 20 phần tử trong suggestions
And kích thước response ≤ 60 kB
And mỗi phần tử KHÔNG có trường locations
And mỗi phần tử KHÔNG có trường quantityOnHand
And mỗi phần tử VẪN có sellableQuantity
```
Baseline: `/catalog?search=2` trả 10 394 phần tử ≈ 3 922 kB.

**AC-05** — Endpoint cũ không đổi hợp đồng
```gherkin
Given FastStockTransferProductSearchInput vẫn gọi GET /catalog?search=
When gọi endpoint đó không truyền limit và không truyền view
Then response giữ nguyên shape PosCatalogLine đầy đủ, có locations[]
And catalogLocationsForLine trả về mảng vị trí không rỗng cho item có tồn
```

**AC-06** — `limit` bị kẹp trần
```gherkin
Given client truyền limit=5000
When gọi GET /catalog/search
Then server dùng limit = 100
And không trả lỗi 400
```

## US-03 — Đưa truy vấn về đường index

> Là người vận hành, tôi muốn mỗi lần gõ không quét toàn bộ bảng `items` và
> `item_barcodes`, để POS nhiều quầy cùng gõ không đè DB.

**AC-07** — Tra khớp tuyệt đối đi index, không seq scan
```gherkin
Given org có 21 024 item POS-visible và 41 714 mã vạch
When EXPLAIN ANALYZE nhánh exact của /catalog/search với q="2"
Then plan không chứa "Seq Scan on items"
And plan không chứa "Seq Scan on item_barcodes"
And Execution Time ≤ 5 ms
```
Baseline: `i.code = $3 OR b.code = $3` bắc qua LEFT JOIN → seq scan cả hai bảng, 25,3 ms.
Đã đo dạng `UNION`: 1,1 ms, hai Index Scan (`UQ_72337e6413e97c8b8fc2e1aaabf`,
`UQ_item_barcodes_org_code`).

**AC-08** — Nhánh mã vạch của đường gợi ý dùng trigram
```gherkin
Given index gin(code gin_trgm_ops) đã có trên item_barcodes
When EXPLAIN ANALYZE "SELECT b.item_id FROM item_barcodes b WHERE b.organization_id = $1 AND b.code ILIKE '%235%'"
Then plan chứa "Bitmap Index Scan" trên index trigram của item_barcodes
And plan không chứa "Seq Scan on item_barcodes"
And Execution Time ≤ 5 ms
```
Baseline: Seq Scan 41 714 dòng, 18,1 ms.

**AC-09** — Nâng minChars chặn được ca 1–2 ký tự
```gherkin
Given minChars của ProductSearchInput là 3
When thu ngân gõ "2" rồi dừng
Then không có request nào rời trình duyệt
When thu ngân gõ tiếp thành "235"
Then có đúng 1 request
And thời gian SQL của nhánh suggest ≤ 5 ms
```
Baseline: `%2%` không dùng được trigram (pg_trgm cần ≥3 ký tự) → quét
`IDX_items_org_pos_catalog` 21 024 dòng. `%235%` → 87 dòng, 3,7 ms.

## US-04 — Không hồi quy các đường đang chạy

**AC-10** — Cảnh báo bán vượt tồn không đổi
```gherkin
Given một item có sellableQuantity = 0 tại chi nhánh
When thu ngân thêm item đó vào giỏ từ dropdown của endpoint mới
Then cảnh báo bán vượt tồn hiện đúng như khi thêm từ đường cũ
```

**AC-11** — Chuyển kho nhanh không hồi quy
```gherkin
Given màn Chuyển kho nhanh dùng useSearchPosBranchCatalog (endpoint cũ)
When tìm một item rồi chọn kho nguồn
Then danh sách kho nguồn vẫn đầy đủ như trước thay đổi
```
