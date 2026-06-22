export interface PreferredShelfShelf {
  id: string;
  code: string;
  name: string;
}

export interface PreferredShelfRowResult {
  itemId: string;
  storageId: string;
  shelf: PreferredShelfShelf | null;
}

export interface PreferredShelfPair {
  itemId: string;
  storageId: string;
}
