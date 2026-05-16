import { ShoppingBagIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { PriceBadge } from "@erp/pos/components/page-components/Checkout/Common/PriceBadge/PriceBadge";
import type { CatalogProduct } from "@erp/pos/lib/page-libs/checkout/checkout.types";

export interface ProductCardProps {
  product: CatalogProduct;
  onSelect: (product: CatalogProduct) => void;
}

/**
 * Single product tile: square-ish image area with a placeholder bag icon,
 * price pill in the bottom-left corner, name underneath.
 */
export function ProductCard({ product, onSelect }: ProductCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(product)}
      className="group w-full flex h-[120px] flex-col overflow-hidden rounded-md border border-transparent bg-white text-left transition-all hover:border-indigo-500 hover:shadow-sm focus:outline-none focus-visible:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500/30"
    >
      <div className="relative flex flex-1 items-center justify-center bg-gray-300">
        <ShoppingBagIcon size={36} className="text-gray-400" strokeWidth={1.25} />
        <span className="absolute bottom-1.5 left-1.5">
          <PriceBadge amount={product.price} />
        </span>
      </div>
      <div className="flex h-6 items-center px-2 text-[12px] font-medium text-gray-700">
        <span className="truncate">{product.name}</span>
      </div>
    </button>
  );
}
