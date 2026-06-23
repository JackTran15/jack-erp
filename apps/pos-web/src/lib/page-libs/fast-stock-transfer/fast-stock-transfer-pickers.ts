import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";
import type { CatalogLocation } from "@erp/pos/types/fast-stock-transfer.type";
import type {
  FastStockTransferFilters,
  FastStockTransferToolbarDraft,
} from "@erp/pos/interfaces/fast-stock-transfer.interface";
import {
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

function locationFromLine(
  line: TempWarehouseLine,
  product: PosCatalogLine,
): CatalogLocation | null {
  const options = catalogLocationsForLine(product);
  const sourceLocationId = line.sourceLocationId?.trim();

  if (sourceLocationId) {
    const matched = options.find((l) => l.locationId === sourceLocationId);
    if (matched) return matched;

    const apiLoc = line.sourceLocation;
    const name =
      apiLoc?.name?.trim() ||
      apiLoc?.code?.trim() ||
      locationLabelForLine(line) ||
      sourceLocationId;
    return {
      locationId: sourceLocationId,
      name,
      quantity: 0,
    };
  }

  const locationLabel = locationLabelForLine(line);
  if (!locationLabel) return null;
  return (
    options.find((l) => catalogLocationName(l) === locationLabel) ?? {
      locationId: locationLabel,
      name: locationLabel,
      quantity: 0,
    }
  );
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
    location = locationFromLine(line, product);
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
