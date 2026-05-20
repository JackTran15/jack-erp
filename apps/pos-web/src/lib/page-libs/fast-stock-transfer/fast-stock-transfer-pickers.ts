import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";
import type { CatalogLocation } from "@erp/pos/types/fast-stock-transfer.type";
import type {
  FastStockTransferFilters,
  FastStockTransferToolbarDraft,
} from "@erp/pos/interfaces/fast-stock-transfer.interface";
import {
  TempWarehouseDirection,
  type TempWarehouseLine,
  type TempWarehousePublicUser,
} from "@erp/shared-interfaces";
import { locationLabelForLine } from "./temp-warehouse-mappers";

export function catalogLocationName(location: CatalogLocation): string {
  return location.name?.trim() ?? "";
}

export function catalogLocationsForLine(
  line: PosCatalogLine,
): ReadonlyArray<CatalogLocation> {
  if (line.locations.length > 0) return line.locations;
  if (line.defaultLocationId) {
    return [
      {
        locationId: line.defaultLocationId,
        name: "",
        quantity: line.quantityOnHand,
      },
    ];
  }
  return [];
}

export function reconcileLocationOnProductChange(
  product: PosCatalogLine | null,
  prevLocation: CatalogLocation | null,
): CatalogLocation | null {
  if (!product) return null;
  const options = catalogLocationsForLine(product);
  if (prevLocation) {
    const matched = options.find(
      (l) => l.locationId === prevLocation.locationId,
    );
    if (matched) return matched;
  }
  return (
    options.find((l) => l.locationId === product.defaultLocationId) ??
    options[0] ??
    null
  );
}

export const EMPTY_FAST_STOCK_TRANSFER_FILTERS: FastStockTransferFilters = {
  sourceWarehouse: "",
  destinationWarehouse: "",
  transporter: "",
  location: "",
  unit: "",
  productName: "",
  sku: "",
  showRowsNeedingReview: true,
};

export const EMPTY_FAST_STOCK_TRANSFER_TOOLBAR_DRAFT: FastStockTransferToolbarDraft =
  {
    carrier: null,
    product: null,
    location: null,
  };

function apiLocationIdForLine(line: TempWarehouseLine): string | null {
  const loc =
    line.direction === TempWarehouseDirection.WAREHOUSE_TO_SHOWROOM
      ? line.sourceLocation
      : line.destinationLocation;
  return loc?.id ?? null;
}

export function lineToToolbarDraft(
  line: TempWarehouseLine,
  product: PosCatalogLine | null,
  resolveCarrierById?: (userId: string) => TempWarehousePublicUser | null,
): FastStockTransferToolbarDraft {
  const carrier =
    line.carrier ??
    (line.carrierUserId && resolveCarrierById
      ? resolveCarrierById(line.carrierUserId)
      : null) ??
    null;

  let location: CatalogLocation | null = null;
  if (product) {
    const options = catalogLocationsForLine(product);
    const apiLocId = apiLocationIdForLine(line);
    const locationLabel = locationLabelForLine(line);
    location =
      (apiLocId ? options.find((l) => l.locationId === apiLocId) : undefined) ??
      (locationLabel
        ? options.find((l) => catalogLocationName(l) === locationLabel)
        : undefined) ??
      options[0] ??
      null;
  }

  return { carrier, product, location };
}

export function userToCarrierUser(user: {
  userId: string;
  displayName: string;
}): TempWarehousePublicUser {
  return {
    id: user.userId,
    firstName: user.displayName,
    lastName: "",
    email: "",
  };
}
