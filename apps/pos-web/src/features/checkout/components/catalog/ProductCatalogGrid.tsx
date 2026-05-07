import type { CatalogProduct } from "../types";
import { ProductCard } from "./ProductCard";

export interface ProductCatalogGridProps {
  products: CatalogProduct[];
  onSelect: (product: CatalogProduct) => void;
  /** Number of columns on desktop (default 6). */
  columns?: number;
}

/**
 * Responsive product grid (default 6 cols at desktop). Click a card to
 * dispatch an "add to invoice" event.
 */
export function ProductCatalogGrid({
  products,
  onSelect,
  columns = 6,
}: ProductCatalogGridProps) {
  return (
    <div
      role="list"
      aria-label="Danh sách sản phẩm tư vấn"
      className="grid gap-2 overflow-auto bg-white p-3"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {products.map((product) => (
        <div role="listitem" key={product.id}>
          <ProductCard product={product} onSelect={onSelect} />
        </div>
      ))}
    </div>
  );
}
