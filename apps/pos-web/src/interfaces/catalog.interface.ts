export interface PosCatalogLine {
  itemId: string;
  code: string;
  name: string;
  unit: string;
  sellingPrice: number;
  quantityOnHand: number;
  locations: { locationId: string; name: string; quantity: number }[];
  defaultLocationId: string;
}
