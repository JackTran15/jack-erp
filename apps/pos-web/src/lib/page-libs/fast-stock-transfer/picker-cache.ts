import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";
import { formatCarrierName } from "@erp/pos/lib/page-libs/fast-stock-transfer/temp-warehouse-mappers";
import type { PosCatalogDirection } from "@erp/pos/types/catalog.type";
import {
  TempWarehouseDirection,
  type TempWarehouseLine,
  type TempWarehousePublicUser,
} from "@erp/shared-interfaces";

export function catalogDirectionForTransfer(
  direction: TempWarehouseDirection,
): PosCatalogDirection {
  return direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM
    ? "warehouse"
    : "showroom";
}

export function mergeCarriersById(
  current: Record<string, TempWarehousePublicUser>,
  users: ReadonlyArray<TempWarehousePublicUser | null | undefined>,
): Record<string, TempWarehousePublicUser> {
  const next = { ...current };
  for (const user of users) {
    if (user) next[user.id] = user;
  }
  return next;
}

export function listCarriersSorted(
  byId: Record<string, TempWarehousePublicUser>,
): TempWarehousePublicUser[] {
  return Object.values(byId).sort((a, b) =>
    formatCarrierName(a).localeCompare(formatCarrierName(b), "vi"),
  );
}

export function mergeProductsByItemId(
  current: Record<string, PosCatalogLine>,
  products: ReadonlyArray<PosCatalogLine | null | undefined>,
): Record<string, PosCatalogLine> {
  const next = { ...current };
  for (const product of products) {
    if (product) next[product.itemId] = product;
  }
  return next;
}

export function catalogLineFromTempWarehouseLine(
  line: TempWarehouseLine,
): PosCatalogLine | null {
  if (!line.item) return null;
  const loc =
    line.direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM
      ? line.sourceLocation
      : line.destinationLocation;
  const locationId = loc?.id ?? "";
  const locationName = loc?.name?.trim() || loc?.code?.trim() || "";
  return {
    itemId: line.itemId,
    productId: null,
    code: line.item.code,
    name: line.item.name,
    unit: line.item.unit,
    sellingPrice: 0,
    quantityOnHand: 0,
    locations: locationId
      ? [{ locationId, name: locationName, quantity: 0 }]
      : [],
    defaultLocationId: locationId,
  };
}

export function collectCarriersFromLines(
  lines: ReadonlyArray<TempWarehouseLine>,
): TempWarehousePublicUser[] {
  const users: TempWarehousePublicUser[] = [];
  for (const line of lines) {
    if (line.carrier) users.push(line.carrier);
  }
  return users;
}

export function collectProductsFromLines(
  lines: ReadonlyArray<TempWarehouseLine>,
): PosCatalogLine[] {
  const products: PosCatalogLine[] = [];
  for (const line of lines) {
    const product = catalogLineFromTempWarehouseLine(line);
    if (product) products.push(product);
  }
  return products;
}
