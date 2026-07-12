/** Danh mục hàng (entityKey `inventory-item-categories`) — dùng lọc nhóm hàng hóa. */
export interface ItemCategoryRow {
  id: string;
  name: string;
  code?: string | null;
}

/** Node cây nhóm hàng hóa từ `POST /v2/inventory/item-categories/tree` (mirror BE ItemCategoryTreeNodeDto). */
export interface ItemCategoryTreeNode {
  id: string;
  code: string | null;
  name: string;
  parentGroupId: string | null;
  status: string;
  children: ItemCategoryTreeNode[];
}

/** Response bọc của endpoint tree. */
export interface ItemCategoryTreeResponse {
  data: ItemCategoryTreeNode[];
}
