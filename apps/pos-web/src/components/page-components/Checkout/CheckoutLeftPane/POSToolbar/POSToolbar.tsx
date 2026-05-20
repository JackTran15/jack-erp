import { useEffect, useState, type RefObject } from "react";
import {
  TagIcon,
  UserPlusIcon,
} from "@erp/pos/components/common/PosIcons/PosIcons";
import { PosSearchPopover } from "@erp/pos/components/common/PosSearchPopover/PosSearchPopover";
import { ProductSearchInput } from "@erp/pos/components/page-components/Checkout/CheckoutLeftPane/POSToolbar/ProductSearchInput/ProductSearchInput";
import { PosToggle } from "@erp/pos/components/common/PosToggle/PosToggle";
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

  // PosSearchPopover owns a string value; mirror each picker's selected label.
  const [salespersonQuery, setSalespersonQuery] = useState(
    meta.selectedSalesperson?.name ?? "",
  );
  useEffect(() => {
    setSalespersonQuery(meta.selectedSalesperson?.name ?? "");
  }, [meta.selectedSalesperson]);

  const [priceBookQuery, setPriceBookQuery] = useState(
    meta.selectedPriceBook?.name ?? "",
  );
  useEffect(() => {
    setPriceBookQuery(meta.selectedPriceBook?.name ?? "");
  }, [meta.selectedPriceBook]);

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
      <label className="inline-flex items-center gap-2 text-[13px] text-gray-700">
        <span>Tách dòng</span>
        <PosToggle
          checked={toolbar.splitLine}
          onChange={(next) => setToolbar((s) => ({ ...s, splitLine: next }))}
          ariaLabel="Tách dòng"
        />
      </label>
      <PosSearchPopover
        inputRef={salespersonRef}
        value={salespersonQuery}
        onValueChange={setSalespersonQuery}
        search={meta.salespersonSearch}
        onSelect={(s) => {
          meta.setSelectedSalesperson(s);
          setSalespersonQuery(s.name);
        }}
        itemKey={(s) => s.id}
        renderItem={(s) => s.name}
        placeholder="NV bán hàng"
        shortcut="Alt + N"
        ariaLabel="Chọn nhân viên bán hàng"
        variant="boxed"
        leadingIcon={<UserPlusIcon size={16} className="text-gray-500" />}
        minChars={0}
        containerClassName="min-w-[180px]"
      />
      <PosSearchPopover
        inputRef={priceBookRef}
        value={priceBookQuery}
        onValueChange={setPriceBookQuery}
        search={meta.priceBookSearch}
        onSelect={(p) => {
          meta.setSelectedPriceBook(p);
          setPriceBookQuery(p.name);
        }}
        itemKey={(p) => p.id}
        renderItem={(p) => p.name}
        placeholder="Chọn bảng giá"
        shortcut="Alt + B"
        ariaLabel="Chọn bảng giá"
        variant="boxed"
        leadingIcon={<TagIcon size={16} className="text-gray-500" />}
        minChars={0}
        containerClassName="min-w-[180px]"
      />
    </div>
  );
}
