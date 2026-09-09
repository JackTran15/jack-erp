import { useCallback, useEffect, useState, type RefObject } from "react";
import { BoxIcon, SearchIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import {
  PosSearchPopover,
  type SearchSuggestion,
} from "@erp/pos/components/common/PosSearchPopover/PosSearchPopover";
import { useCheckoutBarcodeAutoAdd } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-barcode-auto-add";
import { useCheckoutCartActions } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-cart-actions";
import { useCheckoutCatalog } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-catalog";
import { useCheckoutMeta } from "@erp/pos/hooks/page-hooks/checkout/use-checkout-meta";
import type { PosCatalogSuggestion } from "@erp/pos/interfaces/catalog.interface";

export interface ProductCatalogHeaderProps {
  /** Forwarded to the underlying input — used by the Shift+F3 hotkey. */
  inputRef: RefObject<HTMLInputElement | null>;
}

/**
 * Section header for the product catalog: uppercase label + product search input
 * + group-filter combobox. Concrete cho PosCatalogLine/ProductGroup — đọc state từ
 * catalog store + meta hook.
 *
 * Ô tìm sản phẩm không có dropdown gợi ý: lưới bên dưới đọc cùng `catalogQuery` và
 * hiển thị kết quả. Ô lọc nhóm hàng ngay cạnh thì VẪN có dropdown.
 */
export function ProductCatalogHeader({ inputRef }: ProductCatalogHeaderProps) {
  const { catalogQuery, setCatalogQuery, setCatalogGroup } = useCheckoutCatalog();
  const meta = useCheckoutMeta();
  const { addProductByItem } = useCheckoutCartActions();
  const { tryAutoAdd, searchWithAutoAdd, resetGuard } =
    useCheckoutBarcodeAutoAdd();

  // Ô này KHÔNG còn hiện dropdown gợi ý (`suppressSuggestions`) — lưới sản phẩm bên
  // dưới là nơi trả lời. Nhưng lượt gọi này vẫn phải chạy: đây là chỗ auto-add mã
  // vạch sống. Khớp mã vạch/SKU 100% → thêm thẳng vào giỏ rồi xoá ô, để lưới không
  // bị kẹt lọc theo chuỗi mã vạch (và để dialog "khớp đúng một card" không mở nhầm
  // sau một lần quét).
  //
  // Luôn trả mảng rỗng: không ai đọc gợi ý ở call-site này nữa.
  const search = useCallback(
    async (q: string): Promise<SearchSuggestion<PosCatalogSuggestion>[]> => {
      const { result } = await searchWithAutoAdd(q);
      if (result === "added") setCatalogQuery("");
      return [];
    },
    [searchWithAutoAdd, setCatalogQuery],
  );

  // Mỗi lần gõ/quét thật mở một phiên nhập mới (nhả guard khử trùng).
  const handleValueChange = useCallback(
    (q: string) => {
      resetGuard();
      setCatalogQuery(q);
    },
    [resetGuard, setCatalogQuery],
  );

  // Enter (máy quét gửi Enter sau chuỗi): tra khớp tuyệt đối → đã add thì xóa ô.
  const handleSubmitQuery = useCallback(
    (q: string): boolean => {
      if (!q.trim()) return true;
      void tryAutoAdd(q).then((result) => {
        if (result === "added") setCatalogQuery("");
      });
      return true;
    },
    [tryAutoAdd, setCatalogQuery],
  );

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
        <PosSearchPopover<PosCatalogSuggestion>
          inputRef={inputRef}
          value={catalogQuery}
          onValueChange={handleValueChange}
          search={search}
          onSubmitQuery={handleSubmitQuery}
          // Lưới sản phẩm bên dưới hiển thị kết quả; dropdown ở đây chỉ là câu trả
          // lời thứ hai cho cùng câu hỏi, và trước đây hai câu trả lời hay lệch nhau.
          suppressSuggestions
          // `onSelect` / `renderItem` / `itemKey` là prop bắt buộc của
          // PosSearchPopover và không bao giờ chạy khi danh sách bị ẩn. Giữ lại thay
          // vì nới type của component dùng chung cho đúng một call-site — và giữ
          // đúng hành vi cũ phòng khi ai đó tắt `suppressSuggestions` để soi lỗi.
          onSelect={(item) => addProductByItem(item)}
          renderItem={(item) => item.name}
          itemKey={(item) => item.itemId}
          placeholder="(Shift + F3) Tìm kiếm"
          // 3, cùng lý do với ô F3: pg_trgm cần ≥3 ký tự mới tra được index, nên
          // 1–2 ký tự quét toàn bộ catalog. Đường Enter không bị ngưỡng này chặn.
          minChars={3}
          debounceMs={150}
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
        renderItem={(g) => (
          <span style={{ paddingLeft: (g.depth ?? 0) * 14 }}>{g.name}</span>
        )}
        placeholder="Lọc theo nhóm hàng hóa"
        ariaLabel="Lọc theo nhóm hàng hóa"
        // type="text" để bỏ nút clear (X) native của input search — chỉ giữ nút
        // clear của PosSearchPopover (reset filter về mặc định).
        inputType="text"
        variant="boxed"
        leadingIcon={<BoxIcon size={16} className="text-gray-500" />}
        minChars={0}
        // Đây là bộ lọc nhóm hàng (danh sách hữu hạn) — hiện đủ mọi nhóm, không
        // giới hạn 8 gợi ý mặc định như ô tìm kiếm sản phẩm.
        maxSuggestions={meta.productGroups.length}
        containerClassName="min-w-[220px]"
      />
    </div>
  );
}
