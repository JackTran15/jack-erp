import { APP_HEADER_PINNED_ITEM_LIMIT, PosMenuItem } from "@erp/pos/components/layout/PosLayout/PosLayout";
import { APP_MENU_ITEMS } from "@erp/pos/constants/pos-menu.constant";

const APP_HEADER_PINNED_STORAGE_KEY = "pos.appHeader.pinnedItemIds";


export function readPinnedItems(): PosMenuItem[] {
  if (typeof window === "undefined") return [];

  try {
    const rawIds = JSON.parse(
      window.localStorage.getItem(APP_HEADER_PINNED_STORAGE_KEY) ?? "[]",
    );

    if (!Array.isArray(rawIds)) return [];

    return rawIds
      .map((id) => APP_MENU_ITEMS.find((item) => item.id === id))
      .filter((item): item is PosMenuItem => Boolean(item))
      .slice(0, APP_HEADER_PINNED_ITEM_LIMIT);
  } catch {
    return [];
  }
}

export function writePinnedItems(items: PosMenuItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    APP_HEADER_PINNED_STORAGE_KEY,
    JSON.stringify(items.map((item) => item.id)),
  );
}

export function clearPinnedItems(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(APP_HEADER_PINNED_STORAGE_KEY);
}