/**
 * Static fixtures for the Item Locations (Vị trí hàng hóa) page. Replaced by
 * API calls when the UI is wired to the real backend.
 */

export type ItemLocationStatus = "ACTIVE" | "INACTIVE";
export type ItemLocationStockStatus = "STOCKED" | "EMPTY";

export interface ItemLocationStorage {
  id: string;
  code: string;
  name: string;
}

export interface ItemLocation {
  id: string;
  code: string;
  name: string;
  storageId: string;
  description?: string;
  stockStatus: ItemLocationStockStatus;
  status: ItemLocationStatus;
}

export const STORAGE_OPTIONS: ItemLocationStorage[] = [
  { id: "storage-ct", code: "KCT", name: "KHO CẦN THƠ" },
  { id: "storage-hcm", code: "KHCM", name: "KHO HỒ CHÍ MINH" },
  { id: "storage-hn", code: "KHN", name: "KHO HÀ NỘI" },
];

/** Generate a realistic-looking dataset (~60 rows) so pagination is exercised. */
function generateMockLocations(): ItemLocation[] {
  const rows: ItemLocation[] = [];
  const aisles = ["A", "B"];
  for (const aisle of aisles) {
    for (let bay = 1; bay <= 7; bay++) {
      for (let level = 1; level <= 6; level++) {
        if (Math.random() < 0.15) continue;
        const code = `${aisle}${String(bay).padStart(2, "0")}.${String(level).padStart(2, "0")}`;
        const stocked = (bay + level) % 3 === 0;
        rows.push({
          id: `loc-${code}`,
          code,
          name: code,
          storageId: "storage-ct",
          description: stocked ? `Khu ${aisle}${bay} kệ ${level}` : "",
          stockStatus: stocked ? "STOCKED" : "EMPTY",
          status: "ACTIVE",
        });
      }
    }
  }
  rows.unshift({
    id: "loc-999-01",
    code: "999.01",
    name: "999.01",
    storageId: "storage-ct",
    description: "Khu vực hàng đặc biệt",
    stockStatus: "STOCKED",
    status: "ACTIVE",
  });
  return rows;
}

export const MOCK_ITEM_LOCATIONS: ItemLocation[] = generateMockLocations();

export const STOCK_STATUS_LABEL: Record<ItemLocationStockStatus, string> = {
  STOCKED: "Đã xếp",
  EMPTY: "Chưa xếp",
};

export const STATUS_LABEL: Record<ItemLocationStatus, string> = {
  ACTIVE: "Đang hoạt động",
  INACTIVE: "Ngừng hoạt động",
};
