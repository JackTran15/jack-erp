import type { RefObject } from "react";
import {
  TagIcon,
  UserPlusIcon,
} from "@erp/pos/components/common/PosIcons/PosIcons";
import { PosSelectSearch } from "@erp/pos/components/common/PosSelectSearch/PosSelectSearch";
import { ProductSearchInput } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/POSToolbar/ProductSearchInput/ProductSearchInput";
import { PosToggleField } from "@erp/pos/components/common/PosToggleField/PosToggleField";
import { PosQuantityInput } from "@erp/pos/components/common/PosQuantityInput/PosQuantityInput";
import { useCheckoutCatalog } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-catalog";
import { useCheckoutMeta } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-meta";
import {
  POS_CHECKOUT_QTY_MIN,
  clampPosCheckoutQtyNumber,
  safePosCheckoutQtyFromRaw,
} from "@erp/pos/lib/page-libs/checkout/posCheckoutQty";

export interface POSToolbarProps {
  productSearchRef: RefObject<HTMLInputElement | null>;
  salespersonRef: RefObject<HTMLInputElement | null>;
  priceBookRef: RefObject<HTMLInputElement | null>;
}

/**
 * Toolbar row sitting under the topbar — search, qty, split-line toggle, plus
 * the salesperson and price-book pickers. Concrete cho PosCatalogLine/
 * Salesperson/PriceBook — đọc state từ catalog store + meta hook.
 */
export function POSToolbar({
  productSearchRef,
  salespersonRef,
  priceBookRef,
}: POSToolbarProps) {
  const { toolbar, setToolbar, catalogLoading } = useCheckoutCatalog();
  const meta = useCheckoutMeta();

  return (
    <div className="flex h-[52px] items-center gap-2 border-b border-gray-200 bg-white px-3">
      <div className="flex grow gap-2">
        <div className="grow">
          <ProductSearchInput
            inputRef={productSearchRef}
            disabled={catalogLoading}
          />
        </div>
        <PosQuantityInput
          displayValue={toolbar.qty}
          onChangeRaw={(raw) =>
            setToolbar((s) => ({ ...s, qty: safePosCheckoutQtyFromRaw(raw) }))
          }
          onBumpUp={() =>
            setToolbar((s) => ({
              ...s,
              qty: clampPosCheckoutQtyNumber(s.qty + 1),
            }))
          }
          onBumpDown={() =>
            setToolbar((s) => ({
              ...s,
              qty: clampPosCheckoutQtyNumber(s.qty - 1),
            }))
          }
          leading={<span className="text-gray-500 pl-2">SL</span>}
          className="w-24"
          min={POS_CHECKOUT_QTY_MIN}
          bumpDownDisabled={toolbar.qty <= POS_CHECKOUT_QTY_MIN}
          variant="boxed"
        />
      </div>
      <PosToggleField
        label="Tách dòng"
        checked={toolbar.splitLine}
        onChange={(next) =>
          setToolbar((s) => ({ ...s, splitLine: next }))
        }
      />
      <PosSelectSearch
        ref={salespersonRef}
        value={meta.selectedSalesperson}
        onChange={meta.setSelectedSalesperson}
        search={meta.salespersonSearch}
        itemKey={(s) => s.id}
        renderItem={(s) => s.name}
        renderSelected={(s) => s.name}
        placeholder="NV bán hàng"
        shortcut="Alt + N"
        leadingIcon={<UserPlusIcon size={16} className="text-gray-500" />}
        ariaLabel="Chọn nhân viên bán hàng"
        className="min-w-[180px]"
      />
      <PosSelectSearch
        ref={priceBookRef}
        value={meta.selectedPriceBook}
        onChange={meta.setSelectedPriceBook}
        search={meta.priceBookSearch}
        itemKey={(p) => p.id}
        renderItem={(p) => p.name}
        renderSelected={(p) => p.name}
        leadingIcon={<TagIcon size={16} className="text-gray-500" />}
        placeholder="Chọn bảng giá"
        shortcut="Alt + B"
        ariaLabel="Chọn bảng giá"
        className="min-w-[180px]"
      />
    </div>
  );
}
