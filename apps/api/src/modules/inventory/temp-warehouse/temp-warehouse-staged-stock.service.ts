import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  TempWarehouseDirection,
  TempWarehouseLineStatus,
  TempWarehouseSessionStatus,
} from '@erp/shared-interfaces';

/**
 * One open temp-warehouse line, with both ends of the movement already resolved
 * to "is this inside one of the branch's main (showroom) storages".
 */
type StagedLineRow = {
  itemId: string;
  quantity: string;
  sourceIsMainStorage: boolean;
  destinationIsMainStorage: boolean;
};

/**
 * Read model over the branch's open temp-warehouse sessions, for callers that
 * need to know how much stock is in flight rather than where it is booked.
 *
 * A staged line has not touched `stock_balances` at all: the goods still sit at
 * the source location until the session closes or an invoice consumes the line
 * (`TempWarehouseService.fulfillInvoiceFromTempWarehouse`). So the question
 * "does this line change main-storage on-hand" is not answered by the line's
 * `direction` label but by whether the movement crosses the main-storage
 * boundary — a session may be pinned to arbitrary storages on either side, and
 * a line staged from one main storage to another changes nothing.
 */
@Injectable()
export class TempWarehouseStagedStockService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Net effect of a branch's open temp-warehouse lines on its main-storage
   * on-hand, per item. Positive where staged stock is heading into a main
   * storage, negative where it is heading out. Items with no net effect are
   * omitted rather than mapped to 0.
   */
  async getBranchDelta(
    branchId: string,
    organizationId: string,
  ): Promise<Map<string, number>> {
    const rows: StagedLineRow[] = await this.dataSource.query(
      // The source of a line is its own shelf when it has one, falling back to
      // the session's source side for the line's direction; the destination is
      // always the session's other side. Same resolution as
      // TempWarehouseService.buildEventPayload.
      //
      // storages.branch_id is uuid while temp_warehouse_sessions.branch_id is
      // varchar, so the branch parameter is compared as text on both sides:
      // casting $2 to uuid would make Postgres deduce two conflicting types for
      // the same parameter and reject the statement.
      `SELECT l.item_id        AS "itemId",
              l.quantity::text AS "quantity",
              COALESCE(src_st.is_main_storage, false) AS "sourceIsMainStorage",
              COALESCE(dst_st.is_main_storage, false) AS "destinationIsMainStorage"
       FROM temp_warehouse_lines l
       INNER JOIN temp_warehouse_sessions s
         ON s.id = l.session_id
        AND s.organization_id = l.organization_id
       LEFT JOIN locations src_l
         ON src_l.id = COALESCE(
              l.source_location_id,
              CASE WHEN l.direction = $3
                   THEN s.warehouse_location_id
                   ELSE s.showroom_location_id END)
       LEFT JOIN storages src_st
         ON src_st.id = src_l.storage_id
        AND src_st.organization_id = $1
        AND src_st.branch_id::text = $2
       LEFT JOIN locations dst_l
         ON dst_l.id = CASE WHEN l.direction = $3
                            THEN s.showroom_location_id
                            ELSE s.warehouse_location_id END
       LEFT JOIN storages dst_st
         ON dst_st.id = dst_l.storage_id
        AND dst_st.organization_id = $1
        AND dst_st.branch_id::text = $2
       WHERE s.organization_id = $1
         AND s.branch_id = $2
         AND s.status = $4
         AND s.deleted_at IS NULL
         AND l.status = $5`,
      [
        organizationId,
        branchId,
        TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM,
        TempWarehouseSessionStatus.ACTIVE,
        TempWarehouseLineStatus.ACTIVE,
      ],
    );

    const delta = new Map<string, number>();
    for (const row of rows) {
      // Only a line that crosses the main-storage boundary moves the number:
      // anything staged wholly inside it, or wholly outside it, is already
      // counted correctly by stock_balances.
      if (row.sourceIsMainStorage === row.destinationIsMainStorage) continue;
      const qty = Number(row.quantity) || 0;
      if (qty === 0) continue;
      const signed = row.destinationIsMainStorage ? qty : -qty;
      delta.set(row.itemId, (delta.get(row.itemId) ?? 0) + signed);
    }
    return delta;
  }
}
