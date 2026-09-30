-- Real figures for the shoe-shop CRM proposal (size curve, sell-through, RFM,
-- size coverage, aged stock, margin, channel mix).
--
-- READ-ONLY. SELECTs plus session-local temp tables, all inside a transaction that
-- ends in ROLLBACK. Output is aggregates only: no customer names or phone numbers.
--
--   PGPASSWORD=... psql -h localhost -p 5433 -U erp_user -d appdb \
--     -f apps/api/scripts/crm-proposal-metrics.sql > crm-metrics.txt
--
-- Scope: the organization with the most finalised SALE invoices, and the last
-- 12 months (change :months below). "Finalised" = status paid / debt / partial_debt
-- and is_draft = false.
--
-- Size and colour come from product_attribute_definitions by name (Size/Cỡ/Kích…,
-- Màu/Color…); items without a size option fall back to items.odd_size.
--
-- invoices.organization_id is varchar like every BaseEntity column, so the org filter
-- compares text to text.

\set ON_ERROR_STOP on
\set months 12
\pset footer off
\pset null '(trống)'

BEGIN;
SET LOCAL statement_timeout = '300s';

-- ---------------------------------------------------------------------------
-- Scratch tables (temp, dropped at ROLLBACK)
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE t_org ON COMMIT DROP AS
SELECT organization_id AS org
FROM invoices
WHERE type = 'SALE' AND status IN ('paid', 'debt', 'partial_debt') AND is_draft = false
GROUP BY organization_id
ORDER BY count(*) DESC
LIMIT 1;

CREATE TEMP TABLE t_inv ON COMMIT DROP AS
SELECT i.id, i.type, i.customer_id, i.branch_id, i.issued_at, i.amount_due, i.subtotal,
       i.discount_amount, i.sales_channel
FROM invoices i
JOIN t_org o ON o.org = i.organization_id
WHERE i.status IN ('paid', 'debt', 'partial_debt') AND i.is_draft = false
  AND i.issued_at IS NOT NULL;

CREATE TEMP TABLE t_attr ON COMMIT DROP AS
SELECT iav.item_id,
       max(CASE WHEN d.name ~* '^\s*(size|sz|cỡ|co\M|kích|kich)' THEN btrim(op.value_label) END) AS size_label,
       max(CASE WHEN d.name ~* '^\s*(màu|mau|color|colour)' THEN btrim(op.value_label) END) AS color_label
FROM item_attribute_values iav
JOIN product_attribute_definitions d ON d.id = iav.attribute_definition_id
JOIN product_attribute_options op ON op.id = iav.option_id
GROUP BY iav.item_id;

CREATE TEMP TABLE t_item ON COMMIT DROP AS
SELECT it.id AS item_id, it.product_id, it.category_id, it.purchase_price,
       coalesce(a.size_label, nullif(btrim(it.odd_size), '')) AS size_label,
       a.color_label
FROM items it
JOIN t_org o ON o.org = it.organization_id
LEFT JOIN t_attr a ON a.item_id = it.id;

CREATE TEMP TABLE t_line ON COMMIT DROP AS
SELECT v.id AS invoice_id, v.type, v.customer_id, v.issued_at, li.direction,
       li.item_id, ti.product_id, ti.category_id, ti.size_label, ti.color_label,
       li.quantity::numeric AS qty, li.line_total::numeric AS line_total,
       (li.cost_price * li.quantity)::numeric AS cost
FROM t_inv v
JOIN invoice_items li ON li.invoice_id = v.id
LEFT JOIN t_item ti ON ti.item_id = li.item_id
WHERE li.is_gift = false;

CREATE TEMP TABLE t_stock ON COMMIT DROP AS
SELECT sb.item_id, sum(sb.quantity)::numeric AS on_hand
FROM stock_balances sb
JOIN t_org o ON o.org = sb.organization_id
GROUP BY sb.item_id
HAVING sum(sb.quantity) > 0;

-- Share of units sold by size over the window; reused by section 12.
CREATE TEMP TABLE t_curve ON COMMIT DROP AS
SELECT size_label, sum(qty) AS units, sum(qty) / sum(sum(qty)) OVER () AS w
FROM t_line
WHERE direction = 'OUT' AND type IN ('SALE', 'EXCHANGE') AND size_label IS NOT NULL
  AND issued_at >= now() - make_interval(months => :months)
GROUP BY size_label;

\echo ''
\echo '=== 0. Phạm vi ================================================================'
SELECT o.org AS organization_id,
       (SELECT count(*) FROM t_inv WHERE type = 'SALE') AS sale_invoices_all_time,
       (SELECT min(issued_at)::date FROM t_inv) AS first_invoice,
       (SELECT max(issued_at)::date FROM t_inv) AS newest_invoice,
       :months AS window_months
FROM t_org o;

\echo ''
\echo '=== 1. Tổng quan hóa đơn bán trong kỳ ========================================'
SELECT count(*) AS invoices,
       round(100.0 * count(customer_id) / nullif(count(*), 0), 1) AS pct_with_customer,
       count(DISTINCT customer_id) AS customers,
       count(DISTINCT branch_id) AS branches,
       round(avg(amount_due)) AS avg_amount_due_vnd,
       round(count(*) / :months::numeric) AS invoices_per_month,
       round(100.0 * sum(discount_amount) / nullif(sum(subtotal), 0), 1) AS pct_discount_of_subtotal
FROM t_inv
WHERE type = 'SALE' AND issued_at >= now() - make_interval(months => :months);

\echo ''
\echo '=== 2. Kiểm tra SĐT dùng chung: 10 mã khách nhiều hóa đơn nhất trong kỳ ======='
\echo 'Mã khách có vài trăm hóa đơn thường là số của quầy nhập cho khách lẻ.'
SELECT c.code AS customer_code,
       (c.phone IS NULL) AS no_phone,
       (c.name ~* '(khách lẻ|khach le|walk)') AS looks_like_walk_in,
       count(*) AS invoices,
       round(100.0 * count(*) / sum(count(*)) OVER (), 2) AS pct_of_invoices_with_customer
FROM t_inv v
JOIN customers c ON c.id = v.customer_id
WHERE v.type = 'SALE' AND v.issued_at >= now() - make_interval(months => :months)
GROUP BY c.id, c.code, c.phone, c.name
ORDER BY count(*) DESC
LIMIT 10;

\echo ''
\echo '=== 3. Danh mục mẫu =========================================================='
SELECT (SELECT count(*) FROM products p JOIN t_org o ON o.org = p.organization_id) AS products_total,
       (SELECT count(DISTINCT product_id) FROM t_line WHERE direction = 'OUT') AS products_ever_sold,
       (SELECT count(DISTINCT product_id) FROM t_line
         WHERE direction = 'OUT' AND issued_at >= now() - make_interval(months => :months)) AS products_sold_in_window,
       (SELECT count(DISTINCT ti.product_id) FROM t_stock s JOIN t_item ti ON ti.item_id = s.item_id) AS products_in_stock_now,
       (SELECT count(*) FROM t_item) AS items_total,
       (SELECT round(100.0 * count(size_label) / nullif(count(*), 0), 1) FROM t_item) AS pct_items_with_size;

\echo ''
\echo '=== 4. Tên thuộc tính biến thể (để kiểm tra nhận diện size/màu) ==============='
SELECT d.name AS attribute_name, count(DISTINCT d.product_id) AS products
FROM product_attribute_definitions d
JOIN t_org o ON o.org = d.organization_id
GROUP BY d.name
ORDER BY 2 DESC
LIMIT 15;

\echo ''
\echo '=== 5. Tỷ lệ bán theo size trong kỳ (toàn bộ) ================================'
SELECT size_label AS size, units::int, round(100 * w, 1) AS pct
FROM t_curve
WHERE w >= 0.005
ORDER BY nullif(replace(substring(size_label FROM '\d+(?:[.,]\d+)?'), ',', '.'), '')::numeric NULLS LAST, size_label;

\echo ''
\echo '=== 5b. Tỷ lệ bán theo size, 4 danh mục bán nhiều nhất ======================='
WITH cat AS (
  SELECT category_id, sum(qty) AS units
  FROM t_line
  WHERE direction = 'OUT' AND type IN ('SALE', 'EXCHANGE') AND size_label IS NOT NULL
    AND issued_at >= now() - make_interval(months => :months)
  GROUP BY category_id
  ORDER BY 2 DESC
  LIMIT 4
), s AS (
  SELECT l.category_id, l.size_label, sum(l.qty) AS units
  FROM t_line l
  JOIN cat ON cat.category_id IS NOT DISTINCT FROM l.category_id
  WHERE l.direction = 'OUT' AND l.type IN ('SALE', 'EXCHANGE') AND l.size_label IS NOT NULL
    AND l.issued_at >= now() - make_interval(months => :months)
  GROUP BY l.category_id, l.size_label
)
SELECT coalesce(c.name, '(không danh mục)') AS category, s.size_label AS size, s.units::int,
       round(100.0 * s.units / sum(s.units) OVER (PARTITION BY s.category_id), 1) AS pct
FROM s
LEFT JOIN inventory_item_categories c ON c.id = s.category_id
ORDER BY 1, nullif(replace(substring(s.size_label FROM '\d+(?:[.,]\d+)?'), ',', '.'), '')::numeric NULLS LAST, 2;

\echo ''
\echo '=== 6. Tỷ lệ trả/đổi theo size trong kỳ ======================================'
SELECT size_label AS size,
       sum(qty) FILTER (WHERE direction = 'OUT' AND type IN ('SALE', 'EXCHANGE'))::int AS units_out,
       sum(qty) FILTER (WHERE direction = 'IN')::int AS units_back,
       round(100.0 * sum(qty) FILTER (WHERE direction = 'IN')
             / nullif(sum(qty) FILTER (WHERE direction = 'OUT' AND type IN ('SALE', 'EXCHANGE')), 0), 1) AS pct_back
FROM t_line
WHERE size_label IS NOT NULL AND issued_at >= now() - make_interval(months => :months)
GROUP BY size_label
HAVING sum(qty) FILTER (WHERE direction = 'OUT' AND type IN ('SALE', 'EXCHANGE')) >= 20
ORDER BY nullif(replace(substring(size_label FROM '\d+(?:[.,]\d+)?'), ',', '.'), '')::numeric NULLS LAST, size_label;

\echo ''
\echo '=== 7. Doanh thu và lợi nhuận gộp trong kỳ (dòng bán, trước giảm giá hóa đơn) ='
SELECT round(sum(line_total)) AS revenue_vnd,
       round(sum(cost)) AS cogs_vnd,
       round(100.0 * (sum(line_total) - sum(cost)) / nullif(sum(line_total), 0), 1) AS gross_margin_pct,
       round((sum(line_total) - sum(cost)) / nullif(count(DISTINCT invoice_id), 0)) AS gross_profit_per_invoice_vnd,
       round(sum(line_total) / nullif(sum(qty), 0)) AS avg_price_per_unit_vnd,
       round(sum(qty) / nullif(count(DISTINCT invoice_id), 0), 2) AS units_per_invoice
FROM t_line
WHERE direction = 'OUT' AND type = 'SALE' AND issued_at >= now() - make_interval(months => :months);

\echo ''
\echo '=== 8. Kênh bán trong kỳ ======================================================'
SELECT sales_channel, count(*) AS invoices,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct_invoices,
       round(100.0 * sum(amount_due) / sum(sum(amount_due)) OVER (), 1) AS pct_revenue
FROM t_inv
WHERE type = 'SALE' AND issued_at >= now() - make_interval(months => :months)
GROUP BY sales_channel
ORDER BY 2 DESC;

\echo ''
\echo '=== 9. Nhóm khách (RFM đơn giản, tính tới hôm nay) ==========================='
\echo 'Mới: mua lần đầu <= 90 ngày. Trung thành: >= 3 hóa đơn trong kỳ và lần cuối <= 90 ngày.'
\echo 'Tiềm năng: lần cuối <= 90 ngày, còn lại. Sắp rời bỏ: 91-180 ngày. Ngủ đông: > 180 ngày.'
WITH c AS (
  SELECT customer_id, min(issued_at) AS first_at, max(issued_at) AS last_at,
         count(*) FILTER (WHERE issued_at >= now() - make_interval(months => :months)) AS n_window,
         sum(amount_due) FILTER (WHERE issued_at >= now() - make_interval(months => :months)) AS spend_window
  FROM t_inv
  WHERE type = 'SALE' AND customer_id IS NOT NULL
  GROUP BY customer_id
), seg AS (
  SELECT *,
         CASE
           WHEN first_at >= now() - interval '90 days' THEN '1 Khách mới'
           WHEN last_at >= now() - interval '90 days' AND n_window >= 3 THEN '2 Trung thành'
           WHEN last_at >= now() - interval '90 days' THEN '3 Tiềm năng'
           WHEN last_at >= now() - interval '180 days' THEN '4 Sắp rời bỏ'
           ELSE '5 Ngủ đông'
         END AS segment
  FROM c
)
SELECT segment, count(*) AS customers,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct,
       round(avg(coalesce(spend_window, 0))) AS avg_spend_window_vnd
FROM seg
GROUP BY segment
ORDER BY segment;

\echo ''
\echo '=== 10. Mua lại =============================================================='
WITH d AS (
  SELECT customer_id, issued_at::date AS day
  FROM t_inv
  WHERE type = 'SALE' AND customer_id IS NOT NULL
  GROUP BY customer_id, issued_at::date
), g AS (
  SELECT customer_id, day - lag(day) OVER (PARTITION BY customer_id ORDER BY day) AS gap
  FROM d
), w AS (
  SELECT customer_id, count(*) AS n
  FROM t_inv
  WHERE type = 'SALE' AND customer_id IS NOT NULL AND issued_at >= now() - make_interval(months => :months)
  GROUP BY customer_id
)
SELECT (SELECT round(100.0 * count(*) FILTER (WHERE n >= 2) / nullif(count(*), 0), 1) FROM w) AS pct_customers_2plus_in_window,
       (SELECT round(avg(n), 2) FROM w) AS avg_invoices_per_customer_in_window,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY gap) AS median_days_between_purchases,
       percentile_cont(0.25) WITHIN GROUP (ORDER BY gap) AS p25_days,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY gap) AS p75_days
FROM g
WHERE gap IS NOT NULL;

\echo ''
\echo '=== 11. Tỷ lệ bán hết theo mẫu (bán trong kỳ ÷ (bán trong kỳ + tồn hiện tại)) ='
WITH p AS (
  SELECT ti.product_id,
         coalesce(sum(l.qty), 0) AS sold,
         coalesce((SELECT sum(s.on_hand) FROM t_stock s JOIN t_item x ON x.item_id = s.item_id
                   WHERE x.product_id = ti.product_id), 0) AS on_hand
  FROM (SELECT DISTINCT product_id FROM t_item WHERE product_id IS NOT NULL) ti
  LEFT JOIN t_line l ON l.product_id = ti.product_id AND l.direction = 'OUT' AND l.type IN ('SALE', 'EXCHANGE')
                    AND l.issued_at >= now() - make_interval(months => :months)
  GROUP BY ti.product_id
), b AS (
  SELECT *, sold / nullif(sold + on_hand, 0) AS st FROM p WHERE sold + on_hand > 0
)
SELECT CASE WHEN st >= 0.6 THEN '1 >= 60%' WHEN st >= 0.3 THEN '2 30-60%' WHEN st > 0 THEN '3 < 30%' ELSE '4 không bán được' END AS sell_through,
       count(*) AS products,
       sum(on_hand)::int AS on_hand_units
FROM b
GROUP BY 1
ORDER BY 1;

\echo ''
\echo '=== 11b. 8 tuần đầu của mẫu mới (lần bán đầu trong kỳ và cách đây >= 8 tuần) =='
WITH f AS (
  SELECT product_id, min(issued_at) AS first_sale
  FROM t_line
  WHERE direction = 'OUT' AND type = 'SALE' AND product_id IS NOT NULL
  GROUP BY product_id
), n AS (
  SELECT f.product_id,
         (SELECT coalesce(sum(l.qty), 0) FROM t_line l
          WHERE l.product_id = f.product_id AND l.direction = 'OUT' AND l.type IN ('SALE', 'EXCHANGE')
            AND l.issued_at < f.first_sale + interval '56 days') AS units_8w
  FROM f
  WHERE f.first_sale >= now() - make_interval(months => :months)
    AND f.first_sale <= now() - interval '56 days'
)
SELECT count(*) AS new_products,
       percentile_cont(0.25) WITHIN GROUP (ORDER BY units_8w) AS p25_units_8w,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY units_8w) AS median_units_8w,
       percentile_cont(0.75) WITHIN GROUP (ORDER BY units_8w) AS p75_units_8w,
       round(avg(units_8w), 1) AS avg_units_8w
FROM n;

\echo ''
\echo '=== 12. Độ phủ size hiện tại theo mẫu + màu (trọng số = tỷ lệ bán mục 5) ======'
\echo 'Chỉ tính nhóm mẫu + màu đang còn ít nhất 1 đôi. >= 70%: chạy quảng cáo; 40-70%: nhắn khách cũ; < 40%: đặt trước.'
WITH g AS (
  SELECT ti.product_id, coalesce(ti.color_label, '') AS color, ti.size_label,
         coalesce(sum(s.on_hand), 0) AS on_hand
  FROM t_item ti
  LEFT JOIN t_stock s ON s.item_id = ti.item_id
  WHERE ti.product_id IS NOT NULL AND ti.size_label IS NOT NULL
  GROUP BY 1, 2, 3
), c AS (
  SELECT g.product_id, g.color,
         sum(coalesce(cv.w, 0)) FILTER (WHERE g.on_hand > 0) / nullif(sum(coalesce(cv.w, 0)), 0) AS coverage,
         sum(g.on_hand) AS on_hand
  FROM g
  LEFT JOIN t_curve cv ON cv.size_label = g.size_label
  GROUP BY 1, 2
  HAVING sum(g.on_hand) > 0
)
SELECT CASE WHEN coverage >= 0.7 THEN '1 >= 70%' WHEN coverage >= 0.4 THEN '2 40-70%' WHEN coverage IS NULL THEN '4 size không có trong lịch sử' ELSE '3 < 40%' END AS size_coverage,
       count(*) AS product_colors,
       sum(on_hand)::int AS on_hand_units
FROM c
GROUP BY 1
ORDER BY 1;

\echo ''
\echo '=== 13. Tồn kho theo lần bán gần nhất của biến thể ============================='
WITH last_sale AS (
  SELECT item_id, max(issued_at) AS last_at
  FROM t_line
  WHERE direction = 'OUT' AND type IN ('SALE', 'EXCHANGE')
  GROUP BY item_id
)
SELECT CASE
         WHEN ls.last_at >= now() - interval '90 days' THEN '1 bán trong 90 ngày'
         WHEN ls.last_at >= now() - interval '180 days' THEN '2 91-180 ngày'
         WHEN ls.last_at IS NOT NULL THEN '3 > 180 ngày'
         ELSE '4 chưa từng bán'
       END AS last_sold,
       count(*) AS items,
       sum(s.on_hand)::int AS on_hand_units,
       round(sum(s.on_hand * coalesce(ti.purchase_price, 0))) AS value_at_purchase_price_vnd
FROM t_stock s
JOIN t_item ti ON ti.item_id = s.item_id
LEFT JOIN last_sale ls ON ls.item_id = s.item_id
GROUP BY 1
ORDER BY 1;

\echo ''
\echo '=== 14. Số hóa đơn bán theo tháng ============================================='
SELECT to_char(date_trunc('month', issued_at), 'YYYY-MM') AS month,
       count(*) AS invoices,
       count(DISTINCT customer_id) AS customers,
       round(sum(amount_due)) AS amount_due_vnd
FROM t_inv
WHERE type = 'SALE' AND issued_at >= date_trunc('month', now()) - make_interval(months => :months)
GROUP BY 1
ORDER BY 1;

\echo ''
\echo '=== 15. Hồ sơ khách: giới tính, ngày sinh, SĐT ==============================='
SELECT count(*) AS customers,
       round(100.0 * count(*) FILTER (WHERE c.phone IS NOT NULL) / nullif(count(*), 0), 1) AS pct_phone,
       round(100.0 * count(*) FILTER (WHERE c.birth_date IS NOT NULL) / nullif(count(*), 0), 1) AS pct_birth_date,
       round(100.0 * count(*) FILTER (WHERE c.gender::text = 'female') / nullif(count(*), 0), 1) AS pct_female,
       round(100.0 * count(*) FILTER (WHERE c.gender::text = 'male') / nullif(count(*), 0), 1) AS pct_male
FROM customers c
JOIN t_org o ON o.org = c.organization_id
WHERE c.status::text = 'ACTIVE';

ROLLBACK;
