import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create 4 read-only views that centralise the JOIN logic used by the
 * inventory-reports services. Plain views (not materialized) — they
 * always reflect the latest state of the underlying tables.
 *
 *   - vw_stock_ledger_enriched     : stock_ledger_entries + items + product + category + branch + location, plus movement subcategory.
 *   - vw_stock_documents           : UNION ALL of goods_receipts, goods_issues, stock_transfers line-level rows.
 *   - vw_stock_balance_enriched    : stock_balances + items + product + category + branch + location.
 *   - vw_stock_transfer_lines_enriched : stock_transfer_lines + transfer header + items + product + category + src/dst branches.
 *
 * Note on column types: `branches.id` is uuid while `*.branch_id` /
 * `*.source_branch_id` columns are varchar — we keep the existing
 * `b.id::text = X.branch_id` join pattern inside these views so the
 * services don't need to know about it.
 */
export class CreateInventoryReportViews1781800000000
  implements MigrationInterface
{
  name = 'CreateInventoryReportViews1781800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── View 1: enriched stock ledger ────────────────────────────────
    await queryRunner.query(`
      CREATE VIEW vw_stock_ledger_enriched AS
      SELECT
        le.id AS ledger_id,
        le.organization_id,
        le.branch_id,
        le.location_id,
        le.item_id,
        le.movement_type,
        le.reference_type,
        le.reference_id,
        le.posted_at,
        le.quantity,
        COALESCE(le.line_value, 0) AS line_value,
        COALESCE(le.unit_cost, 0) AS unit_cost,
        CASE WHEN le.quantity > 0 THEN 1 ELSE 0 END AS is_in,
        CASE WHEN le.quantity < 0 THEN 1 ELSE 0 END AS is_out,
        CASE le.movement_type::text
          WHEN 'PURCHASE_RECEIPT' THEN 'PURCHASE'
          WHEN 'TRANSFER_IN' THEN 'TRANSFER_IN'
          WHEN 'TRANSFER_OUT' THEN 'TRANSFER_OUT'
          WHEN 'RETURN_IN' THEN 'RETURN_IN'
          WHEN 'SALE_ISSUE' THEN 'SALE'
          WHEN 'ADJUSTMENT_INCREASE' THEN 'ADJUSTMENT_IN'
          WHEN 'ADJUSTMENT_DECREASE' THEN 'ADJUSTMENT_OUT'
          WHEN 'EXCHANGE_IN' THEN 'EXCHANGE_IN'
          WHEN 'EXCHANGE_OUT' THEN 'EXCHANGE_OUT'
          WHEN 'GOODS_ISSUE' THEN 'OTHER_OUT'
          ELSE 'OTHER'
        END AS subcategory,
        i.code AS sku,
        i.name AS item_name,
        i.unit AS unit,
        i.product_id,
        i.category_id,
        pr.name AS parent_name,
        ic.name AS category_name,
        b.id AS branch_uuid,
        b.name AS branch_name,
        loc.code AS location_code,
        loc.name AS location_name
      FROM stock_ledger_entries le
      JOIN items i ON i.id = le.item_id AND i.organization_id = le.organization_id
      LEFT JOIN products pr ON pr.id = i.product_id AND pr.organization_id = i.organization_id
      LEFT JOIN inventory_item_categories ic ON ic.id = i.category_id
      LEFT JOIN branches b ON b.id::text = le.branch_id AND b.organization_id = le.organization_id
      LEFT JOIN locations loc ON loc.id = le.location_id
    `);

    // ── View 2: unified posted stock documents (line-level) ──────────
    // gi.target_branch_id is uuid → cast to text for the unified column.
    // stock_transfers.source_branch_id / destination_branch_id are uuid → cast to text.
    await queryRunner.query(`
      CREATE VIEW vw_stock_documents AS
      SELECT
        'GOODS_RECEIPT'::text AS doc_kind,
        gr.id AS document_id,
        gr.organization_id,
        gr.document_number,
        gr.reference_id::text AS reference_number,
        gr.branch_id AS branch_id,
        NULL::text AS receiver_branch_id,
        gr.posted_at,
        gr.status::text AS status,
        grl.item_id,
        grl.location_id,
        grl.quantity::numeric AS in_qty,
        grl.unit_price::numeric AS in_unit_price,
        (grl.quantity::numeric * grl.unit_price::numeric) AS in_value,
        NULL::numeric AS in_sale_price,
        0::numeric AS out_qty,
        0::numeric AS out_unit_price,
        0::numeric AS out_value,
        NULL::numeric AS out_sale_price,
        NULL::text AS customer_name,
        grl.note AS notes
      FROM goods_receipts gr
      JOIN goods_receipt_lines grl ON grl.goods_receipt_id = gr.id

      UNION ALL

      SELECT
        'GOODS_ISSUE'::text,
        gi.id,
        gi.organization_id,
        gi.document_number,
        NULL::text,
        gi.branch_id,
        gi.target_branch_id::text,
        gi.posted_at,
        gi.status::text,
        gil.item_id,
        gi.location_id,
        0::numeric, 0::numeric, 0::numeric, NULL::numeric,
        gil.quantity::numeric,
        gil.unit_price::numeric,
        (gil.quantity::numeric * gil.unit_price::numeric),
        NULL::numeric,
        p.name,
        gil.notes
      FROM goods_issues gi
      JOIN goods_issue_lines gil ON gil.goods_issue_id = gi.id
      LEFT JOIN inventory_providers p ON p.id = gi.provider_id

      UNION ALL

      SELECT
        'STOCK_TRANSFER'::text,
        st.id,
        st.organization_id,
        st.document_number,
        NULL::text,
        st.source_branch_id::text,
        st.destination_branch_id::text,
        st.posted_at,
        st.status::text,
        stl.item_id,
        COALESCE(stl.source_location_id, st.source_location_id),
        0::numeric, 0::numeric, 0::numeric, NULL::numeric,
        stl.quantity::numeric,
        COALESCE(i.purchase_price, 0)::numeric,
        (stl.quantity::numeric * COALESCE(i.purchase_price, 0)::numeric),
        NULL::numeric,
        NULL::text,
        stl.notes
      FROM stock_transfers st
      JOIN stock_transfer_lines stl ON stl.transfer_id = st.id
      JOIN items i ON i.id = stl.item_id AND i.organization_id = st.organization_id
    `);

    // ── View 3: enriched stock balance ───────────────────────────────
    await queryRunner.query(`
      CREATE VIEW vw_stock_balance_enriched AS
      SELECT
        sb.organization_id,
        sb.branch_id,
        sb.location_id,
        sb.item_id,
        sb.quantity::numeric AS quantity,
        (sb.quantity::numeric * COALESCE(i.purchase_price, 0)) AS line_value,
        COALESCE(i.purchase_price, 0) AS unit_cost,
        i.code AS sku,
        i.name AS item_name,
        i.unit,
        i.product_id,
        i.category_id,
        pr.name AS parent_name,
        ic.name AS category_name,
        b.id AS branch_uuid,
        b.name AS branch_name,
        loc.code AS location_code,
        loc.name AS location_name
      FROM stock_balances sb
      JOIN items i ON i.id = sb.item_id AND i.organization_id = sb.organization_id
      LEFT JOIN products pr ON pr.id = i.product_id AND pr.organization_id = i.organization_id
      LEFT JOIN inventory_item_categories ic ON ic.id = i.category_id
      LEFT JOIN branches b ON b.id::text = sb.branch_id AND b.organization_id = sb.organization_id
      LEFT JOIN locations loc ON loc.id = sb.location_id
    `);

    // ── View 4: enriched stock transfer lines ────────────────────────
    await queryRunner.query(`
      CREATE VIEW vw_stock_transfer_lines_enriched AS
      SELECT
        st.id AS transfer_id,
        st.organization_id,
        st.document_number,
        st.posted_at,
        st.status,
        st.source_branch_id,
        st.destination_branch_id,
        stl.id AS line_id,
        stl.item_id,
        COALESCE(stl.source_location_id, st.source_location_id) AS source_location_id,
        COALESCE(stl.destination_location_id, st.destination_location_id) AS destination_location_id,
        stl.quantity::numeric AS quantity,
        COALESCE(i.purchase_price, 0) AS unit_cost,
        (stl.quantity::numeric * COALESCE(i.purchase_price, 0)) AS line_value,
        i.code AS sku,
        i.name AS item_name,
        i.unit,
        i.product_id,
        i.category_id,
        pr.name AS parent_name,
        ic.name AS category_name,
        src_b.name AS source_branch_name,
        dst_b.name AS destination_branch_name
      FROM stock_transfers st
      JOIN stock_transfer_lines stl ON stl.transfer_id = st.id
      JOIN items i ON i.id = stl.item_id AND i.organization_id = st.organization_id
      LEFT JOIN products pr ON pr.id = i.product_id AND pr.organization_id = i.organization_id
      LEFT JOIN inventory_item_categories ic ON ic.id = i.category_id
      LEFT JOIN branches src_b ON src_b.id = st.source_branch_id AND src_b.organization_id = st.organization_id
      LEFT JOIN branches dst_b ON dst_b.id = st.destination_branch_id AND dst_b.organization_id = st.organization_id
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP VIEW IF EXISTS vw_stock_transfer_lines_enriched`,
    );
    await queryRunner.query(`DROP VIEW IF EXISTS vw_stock_balance_enriched`);
    await queryRunner.query(`DROP VIEW IF EXISTS vw_stock_documents`);
    await queryRunner.query(`DROP VIEW IF EXISTS vw_stock_ledger_enriched`);
  }
}
