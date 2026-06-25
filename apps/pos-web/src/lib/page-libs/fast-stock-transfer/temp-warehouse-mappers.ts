import type { FastStockTransferTableRow } from "@erp/pos/types/fast-stock-transfer.type";
import type {
  FastStockTransferFilters,
  FastStockTransferToolbarDraft,
} from "@erp/pos/interfaces/fast-stock-transfer.interface";
import type {
  AddTempWarehouseLineBody,
  UpdateTempWarehouseLineBody,
} from "@erp/shared-interfaces";
import {
  TempWarehouseDirection,
  TempWarehouseLine,
  TempWarehouseLineStatus,
  TempWarehouseNettedItem,
  TempWarehousePublicUser,
} from "@erp/shared-interfaces";
import { catalogLocationName } from "./fast-stock-transfer-pickers";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isShelfUuid(value: string | undefined): value is string {
  return Boolean(value && UUID_RE.test(value));
}

export function formatCarrierName(
  carrier: TempWarehousePublicUser | null | undefined,
): string {
  if (!carrier) return "";
  const name = `${carrier.firstName} ${carrier.lastName}`.trim();
  return name || carrier.email;
}

export function locationLabelForLine(line: TempWarehouseLine): string {
  return line.notes?.trim() ?? "";
}

export function lineSku(line: TempWarehouseLine): string {
  return line.item?.code ?? "";
}

export function lineProductName(line: TempWarehouseLine): string {
  return line.item?.name ?? "";
}

export function lineUnit(line: TempWarehouseLine): string {
  return line.item?.unit ?? "";
}

export function lineQuantityDisplay(line: TempWarehouseLine): number {
  const n = Number(line.quantity);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function attachTransferSelection(
  line: TempWarehouseLine,
  isTransferSelected: boolean,
): FastStockTransferTableRow {
  return { ...line, isTransferSelected };
}

/**
 * A line consumed by a checkout (transferred out to the showroom against an
 * invoice). Surfaced read-only when "Hiển thị dòng cần kiểm tra" is unticked.
 */
export function isLineSaleTransferred(line: TempWarehouseLine): boolean {
  return (
    line.status === TempWarehouseLineStatus.TRANSFERRED &&
    Boolean(line.invoiceId)
  );
}

function matchesText(value: string, query: string): boolean {
  if (!query.trim()) return true;
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

export function lineMatchesTableFilters(
  line: TempWarehouseLine,
  filters: FastStockTransferFilters,
  balancedLineIds: ReadonlySet<string>,
): boolean {
  if (!matchesText(formatCarrierName(line.carrier), filters.transporter)) {
    return false;
  }
  if (!matchesText(lineSku(line), filters.sku)) return false;
  if (!matchesText(lineProductName(line), filters.productName)) return false;
  if (!matchesText(locationLabelForLine(line), filters.location)) return false;
  if (!matchesText(lineUnit(line), filters.unit)) return false;
  if (filters.showRowsNeedingReview) {
    // Ticked = only rows needing review: hide sale-consumed and balanced rows.
    if (isLineSaleTransferred(line)) return false;
    if (balancedLineIds.has(line.id)) return false;
  }
  return true;
}

export function buildBalancedLineIds(
  lines: ReadonlyArray<TempWarehouseLine>,
): Set<string> {
  type LineEntry = { id: string; qty: number; createdAt: string };

  const byItem = new Map<string, { w2s: LineEntry[]; s2w: LineEntry[] }>();

  for (const line of lines) {
    if (
      line.status !== TempWarehouseLineStatus.ACTIVE &&
      line.status !== TempWarehouseLineStatus.AUTO_BALANCED
    ) {
      continue;
    }
    const qty = Number(line.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    let bucket = byItem.get(line.itemId);
    if (!bucket) {
      bucket = { w2s: [], s2w: [] };
      byItem.set(line.itemId, bucket);
    }
    const entry: LineEntry = {
      id: line.id,
      qty,
      createdAt: line.createdAt,
    };
    if (line.direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM) {
      bucket.w2s.push(entry);
    } else {
      bucket.s2w.push(entry);
    }
  }

  const balanced = new Set<string>();
  const byTime = (a: LineEntry, b: LineEntry) =>
    a.createdAt.localeCompare(b.createdAt);

  const markBalancedSide = (side: LineEntry[], pool: number) => {
    let remaining = pool;
    for (const entry of side) {
      if (remaining <= 0) break;
      if (entry.qty <= remaining) {
        balanced.add(entry.id);
        remaining -= entry.qty;
      }
    }
  };

  for (const bucket of byItem.values()) {
    const w2s = [...bucket.w2s].sort(byTime);
    const s2w = [...bucket.s2w].sort(byTime);
    const totalW2s = w2s.reduce((sum, l) => sum + l.qty, 0);
    const totalS2w = s2w.reduce((sum, l) => sum + l.qty, 0);
    const pairedQty = Math.min(totalW2s, totalS2w);
    markBalancedSide(w2s, pairedQty);
    markBalancedSide(s2w, pairedQty);
  }

  return balanced;
}

export function mapDraftToAddBody(
  draft: FastStockTransferToolbarDraft,
  branchId: string,
  direction: TempWarehouseDirection,
): AddTempWarehouseLineBody {
  const body: AddTempWarehouseLineBody = {
    branchId,
    itemId: draft.product!.itemId,
    direction,
  };
  if (draft.carrier?.id) body.carrierUserId = draft.carrier.id;
  const notes = locationNotesFromDraft(draft);
  if (notes) body.notes = notes;
  const shelfId = draft.location?.locationId;
  if (isShelfUuid(shelfId)) body.sourceLocationId = shelfId;
  return body;
}

export function mapDraftToPatchBody(
  draft: FastStockTransferToolbarDraft,
): UpdateTempWarehouseLineBody {
  const body: UpdateTempWarehouseLineBody = {};
  if (draft.product?.itemId) body.itemId = draft.product.itemId;
  body.carrierUserId = draft.carrier?.id ?? null;
  body.notes = locationNotesFromDraft(draft) ?? null;
  const shelfId = draft.location?.locationId;
  body.sourceLocationId = isShelfUuid(shelfId)
    ? shelfId
    : draft.location
      ? null
      : undefined;
  return body;
}

function locationNotesFromDraft(
  draft: FastStockTransferToolbarDraft,
): string | undefined {
  if (!draft.location) return undefined;
  const notes = catalogLocationName(draft.location);
  return notes || undefined;
}

export function buildImbalancedItemIds(
  items: ReadonlyArray<TempWarehouseNettedItem>,
): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.totalW2s !== item.totalS2w) {
      ids.add(item.itemId);
    }
  }
  return ids;
}

export function filterImbalancedNettedItems(
  items: ReadonlyArray<TempWarehouseNettedItem>,
): TempWarehouseNettedItem[] {
  return items.filter((i) => i.totalW2s !== i.totalS2w);
}

export function nettedProductLabel(item: TempWarehouseNettedItem): string {
  const name = item.item?.name ?? item.itemId;
  const code = item.item?.code ?? "";
  return code ? `${name} (${code})` : name;
}

export function nettedDiscrepancyReason(item: TempWarehouseNettedItem): string {
  if (item.totalW2s === 0 && item.totalS2w > 0) {
    return "Chưa có phiếu xuất đi tương ứng";
  }
  if (item.totalW2s > 0 && item.totalS2w === 0) {
    return "Đã xuất đi nhưng chưa trả lại/chưa bán";
  }
  if (item.totalW2s !== item.totalS2w) {
    return "Số lượng xuất đi và trả lại không khớp";
  }
  return "—";
}
