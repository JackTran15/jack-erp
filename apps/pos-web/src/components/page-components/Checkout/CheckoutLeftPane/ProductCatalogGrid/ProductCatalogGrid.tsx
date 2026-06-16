import { ProductCard } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/ProductCatalogGrid/ProductCard/ProductCard";
import { useCheckoutCatalog } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-catalog";

export interface ProductCatalogGridProps {
  /** Number of columns on desktop (default 6). */
  columns?: number;
}

/**
 * Responsive product grid (default 6 cols at desktop). Đọc danh sách sản phẩm
 * từ catalog store; ProductCard tự gọi cart-actions hook khi click.
 */
export function ProductCatalogGrid({ columns = 6 }: ProductCatalogGridProps) {
  const { catalogProducts } = useCheckoutCatalog();

  return (
    <div
      role="list"
      aria-label="Danh sách sản phẩm tư vấn"
      className="grid max-h-[400px] gap-2 overflow-auto bg-white p-3"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {catalogProducts.map((product) => (
        <div role="listitem" key={product.id}>
          <ProductCard product={product} />
        </div>
      ))}
    </div>
  );
}
