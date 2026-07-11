import type { ItemCategoryTreeNode } from "@erp/pos/interfaces/item-category.interface";
import type { ProductGroup } from "@erp/pos/interfaces/checkout.interface";

/**
 * Phẳng hoá cây nhóm hàng hóa theo thứ tự tiền-thứ-tự (pre-order DFS), gắn `depth`
 * để combobox thụt lề node con. Giữ nguyên thứ tự BE đã sắp (name ASC).
 */
export const flattenItemCategoryTree = (
  nodes: ReadonlyArray<ItemCategoryTreeNode>,
  depth = 0,
): ProductGroup[] =>
  nodes.flatMap((node) => [
    {
      id: node.id,
      name: node.name,
      depth,
      parentGroupId: node.parentGroupId,
    },
    ...flattenItemCategoryTree(node.children, depth + 1),
  ]);
