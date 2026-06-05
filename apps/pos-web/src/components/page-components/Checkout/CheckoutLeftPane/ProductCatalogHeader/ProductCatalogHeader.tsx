import { useEffect, useState, type RefObject } from "react";
import { BoxIcon, SearchIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { PosSearchPopover } from "@erp/pos/components/common/PosSearchPopover/PosSearchPopover";
import { useCheckoutCartActions } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-cart-actions";
import { useCheckoutCatalog } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-catalog";
import { useCheckoutMeta } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-meta";
import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";

export interface ProductCatalogHeaderProps {
  /** Forwarded to the underlying input — used by the Shift+F3 hotkey. */
  inputRef: RefObject<HTMLInputElement | null>;
}

/**
 * Section header for the product catalog: uppercase label + product search
 * popover + group-filter combobox. Concrete cho PosCatalogLine/ProductGroup —
 * đọc state từ catalog store + meta hook.
 */
export function ProductCatalogHeader({ inputRef }: ProductCatalogHeaderProps) {
  const { catalogQuery, setCatalogQuery, setCatalogGroup, productSearchAdapter } =
    useCheckoutCatalog();
  const meta = useCheckoutMeta();
  const { addProductByItem } = useCheckoutCartActions();

  // PosSearchPopover owns a string value; mirror the selected group's name.
  const [groupQuery, setGroupQuery] = useState(
    meta.selectedProductGroup?.name ?? "",
  );
  useEffect(() => {
    setGroupQuery(meta.selectedProductGroup?.name ?? "");
  }, [meta.selectedProductGroup]);

  return (
    <div className="flex h-12 items-center gap-3 border-b border-gray-200 bg-white px-3">
      <span className="text-[12px] font-bold uppercase tracking-[0.05em] text-gray-700">
        Tư vấn bán hàng
      </span>

      <div className="ml-auto w-[280px]">
        <PosSearchPopover<PosCatalogLine>
          inputRef={inputRef}
          value={catalogQuery}
          onValueChange={setCatalogQuery}
          search={productSearchAdapter}
          onSelect={(item) => addProductByItem(item)}
          itemKey={(item) => item.itemId}
          renderItem={(item) => item.name}
          renderMeta={(item) => `${item.code} · ${item.unit}`}
          placeholder="(Shift + F3) Tìm kiếm"
          containerClassName="flex h-9 w-full items-stretch overflow-hidden rounded-md border border-gray-200 bg-white focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20"
          inputClassName="min-w-0 flex-1 bg-transparent pr-3 text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none"
          prefix={
            <span className="flex shrink-0 items-center pl-2.5 pr-1.5 text-gray-400">
              <SearchIcon size={14} />
            </span>
          }
        />
      </div>

      <PosSearchPopover
        value={groupQuery}
        onValueChange={setGroupQuery}
        search={meta.productGroupSearch}
        onSelect={(g) => {
          setCatalogGroup(g.id);
          setGroupQuery(g.name);
        }}
        onClear={() => {
          // Clear value → về category mặc định (categoryId = null) → hiện tất cả.
          setCatalogGroup(undefined);
          setGroupQuery("");
        }}
        itemKey={(g) => g.id}
        renderItem={(g) => g.name}
        placeholder="Lọc theo nhóm hàng hóa"
        ariaLabel="Lọc theo nhóm hàng hóa"
        // type="text" để bỏ nút clear (X) native của input search — chỉ giữ nút
        // clear của PosSearchPopover (reset filter về mặc định).
        inputType="text"
        variant="boxed"
        leadingIcon={<BoxIcon size={16} className="text-gray-500" />}
        minChars={0}
        containerClassName="min-w-[220px]"
      />
    </div>
  );
}
