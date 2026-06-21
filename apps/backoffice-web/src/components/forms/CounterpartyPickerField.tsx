import { useCallback, useState } from "react";
import { LookupField } from "./LookupField";
import { CounterpartyPickerModal } from "./CounterpartyPickerModal";
import {
  COUNTERPARTY_KIND_LABEL,
  counterpartyKey,
  useCounterpartySearch,
  type CounterpartyOption,
  type CounterpartySearchType,
} from "../../hooks/useCounterpartySearch";

interface Props {
  /** Display value shown in the input (typically the selected counterparty code). */
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (item: CounterpartyOption) => void;
  /** Initial "Loại đối tượng" for the search modal + the type used by inline type-ahead. */
  defaultType?: CounterpartySearchType;
  /** Restrict the modal's type dropdown. Omit for all types. */
  allowedTypes?: CounterpartySearchType[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  dropdownMinWidth?: number;
  /** Trailing `+` quick-create button (forwarded to LookupField). */
  onCreateNew?: () => void;
  createMenuItems?: Array<{ label: string; onClick: () => void }>;
  modalTitle?: string;
  modalPlaceholder?: string;
}

const INLINE_PAGE_SIZE = 8;

export function CounterpartyPickerField({
  value,
  onValueChange,
  onSelect,
  defaultType = "all",
  allowedTypes,
  disabled,
  placeholder,
  className,
  dropdownMinWidth = 520,
  onCreateNew,
  createMenuItems,
  modalTitle,
  modalPlaceholder,
}: Props) {
  const search = useCounterpartySearch();
  const [modalOpen, setModalOpen] = useState(false);

  // Inline type-ahead searches the field's default type; switching types is the
  // modal's job (it carries the "Loại đối tượng" dropdown).
  const inlineSearch = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      const ps = pageSize ?? INLINE_PAGE_SIZE;
      const res = await search(defaultType, query, page, ps);
      return {
        items: res.data,
        hasMore: page * ps < res.total,
        total: res.total,
      };
    },
    [search, defaultType],
  );

  return (
    <>
      <LookupField<CounterpartyOption>
        value={value}
        onValueChange={onValueChange}
        onSelect={onSelect}
        search={inlineSearch}
        itemKey={counterpartyKey}
        renderItem={(c) => c.name}
        renderMeta={(c) => c.code ?? ""}
        columns={[
          { key: "code", label: "Mã", className: "w-[150px] font-mono", render: (c) => c.code ?? "—" },
          { key: "name", label: "Tên", render: (c) => c.name },
          { key: "kind", label: "Loại", className: "w-[120px]", render: (c) => COUNTERPARTY_KIND_LABEL[c.kind] },
          { key: "phone", label: "Điện thoại", className: "w-[120px]", render: (c) => c.phone ?? "—" },
        ]}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        dropdownMinWidth={dropdownMinWidth}
        onCreateNew={onCreateNew}
        createMenuItems={createMenuItems}
        onSearchButtonClick={() => setModalOpen(true)}
      />
      <CounterpartyPickerModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onSelect={onSelect}
        defaultType={defaultType}
        allowedTypes={allowedTypes}
        title={modalTitle}
        searchPlaceholder={modalPlaceholder}
      />
    </>
  );
}
