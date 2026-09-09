import { useCallback, useMemo } from "react";
import { FormField, Input } from "@erp/ui";
import { PARTNER_LOOKUP_OPTIONS } from "./voucher-partner.constants";
import { LookupField } from "../../../../components/forms/LookupField";
import type { LookupSearchResult } from "../../../../components/forms/LookupField";
import { READONLY_INPUT_CLASS } from "../../ledger-cash/ledger-cash.constants";
import {
  PartnerLookupType,
  PARTNER_LOOKUP_LABEL,
} from "./voucher-partner.constants";
import {
  mergePartnerSearchWithSelection,
  usePartnerSearch,
  type VoucherPartnerOption,
} from "./voucher-partner-search";

export interface VoucherPartnerSelection {
  partnerKind: PartnerLookupType;
  partnerId: string;
  partnerCode: string;
  partnerName: string;
  partnerPhone?: string;
  address?: string;
}

interface Props {
  label: string;
  readOnly: boolean;
  partnerKind?: PartnerLookupType;
  partnerId: string;
  partnerCode: string;
  partnerName: string;
  partnerPhone?: string;
  onPartnerSelect: (selection: VoucherPartnerSelection) => void;
  onPartnerLookupChange: (code: string) => void;
  /** Called as the user types a hand-entered party name (kind = OTHER only). */
  onPartnerNameChange?: (name: string) => void;
  onPartnerClear: () => void;
  onOpenSearchDialog: () => void;
  onCreateNew?: (kind: PartnerLookupType) => void;
}

const PARTNER_LOOKUP_COLUMNS = [
  {
    key: "code",
    label: "Mã",
    className: "w-28",
    render: (item: VoucherPartnerOption) => item.code || "—",
  },
  {
    key: "name",
    label: "Tên",
    render: (item: VoucherPartnerOption) => item.name,
  },
  {
    key: "kind",
    label: "Loại",
    className: "w-32",
    render: (item: VoucherPartnerOption) => item.kindLabel,
  },
  {
    key: "phone",
    label: "Điện thoại",
    className: "w-32",
    render: (item: VoucherPartnerOption) => item.phone ?? "—",
  },
];

export function VoucherPartnerFields({
  label,
  readOnly,
  partnerKind,
  partnerId,
  partnerCode,
  partnerName,
  partnerPhone,
  onPartnerSelect,
  onPartnerLookupChange,
  onPartnerNameChange,
  onPartnerClear,
  onOpenSearchDialog,
  onCreateNew,
}: Props) {
  const searchPartners = usePartnerSearch();
  const kindLabel = partnerKind ? PARTNER_LOOKUP_LABEL[partnerKind] : "";

  const createMenuItems = useMemo(
    () =>
      onCreateNew
        ? PARTNER_LOOKUP_OPTIONS.map((opt) => ({
            label: opt.label,
            onClick: () => onCreateNew(opt.value),
          }))
        : undefined,
    [onCreateNew],
  );
  const inlineSearchKind = partnerId
    ? (partnerKind ?? PartnerLookupType.ALL)
    : PartnerLookupType.ALL;

  const currentSelection = useMemo((): VoucherPartnerOption | null => {
    if (!partnerId || !partnerKind) return null;
    return {
      lookupKey: `${partnerKind}:${partnerId}`,
      id: partnerId,
      code: partnerCode,
      name: partnerName,
      phone: partnerPhone,
      kind: partnerKind,
      kindLabel: PARTNER_LOOKUP_LABEL[partnerKind],
    };
  }, [partnerId, partnerKind, partnerCode, partnerName, partnerPhone]);

  const searchByFormKind = useCallback(
    async (
      query: string,
      page: number,
      pageSize?: number,
    ): Promise<LookupSearchResult<VoucherPartnerOption>> => {
      const q = query.trim();
      const ps = pageSize;

      if (
        currentSelection &&
        page === 1 &&
        (!q || q === partnerCode || q === partnerName)
      ) {
        if (!q) {
          return { items: [currentSelection], hasMore: false, total: 1 };
        }
      }

      const raw = await searchPartners(
        inlineSearchKind,
        query,
        page,
        ps,
      );
      return mergePartnerSearchWithSelection(raw, currentSelection, page);
    },
    [inlineSearchKind, currentSelection, partnerCode, partnerName, searchPartners],
  );

  const handleSelect = useCallback(
    (item: VoucherPartnerOption) => {
      onPartnerSelect({
        partnerKind: item.kind,
        partnerId: item.id,
        partnerCode: item.code,
        partnerName: item.name,
        partnerPhone: item.phone,
        address: item.address,
      });
    },
    [onPartnerSelect],
  );

  if (readOnly) {
    // A hand-typed party carries no code, so the code box would only ever be an
    // empty input that reads as a rendering fault. The distinction is `partnerId`,
    // not `partnerKind` — the kind is no longer something the user picks.
    if (!partnerId) {
      return (
        <FormField label={label} layout="horizontal" labelWidth="8rem">
          <Input
            value={partnerName}
            readOnly
            disabled
            className={READONLY_INPUT_CLASS}
            title={kindLabel}
          />
        </FormField>
      );
    }
    return (
      <FormField label={label} layout="horizontal" labelWidth="8rem">
        <div className="grid grid-cols-[minmax(7rem,1fr)_2fr] gap-2">
          <Input
            value={partnerCode}
            readOnly
            disabled
            className={READONLY_INPUT_CLASS}
            title={kindLabel}
          />
          <Input
            value={partnerName}
            readOnly
            disabled
            className={READONLY_INPUT_CLASS}
          />
        </div>
      </FormField>
    );
  }

  return (
    <FormField label={label} layout="horizontal" labelWidth="8rem">
      <div className="grid grid-cols-[minmax(7rem,1fr)_2fr] gap-2">
        <LookupField
          className="min-w-0"
          value={partnerCode}
          onValueChange={(v) => {
            onPartnerLookupChange(v);
            if (!v.trim()) onPartnerClear();
          }}
          onSelect={handleSelect}
          search={searchByFormKind}
          itemKey={(item) => item.lookupKey}
          renderItem={(item) => item.code || "—"}
          columns={PARTNER_LOOKUP_COLUMNS}
          placeholder="Mã"
          disabled={readOnly}
          portalToBody
          dropdownMinWidth={520}
          onSearchButtonClick={onOpenSearchDialog}
          createMenuItems={createMenuItems}
        />
        {/* Always typeable (ADR-01). Leaving the code box empty and typing here
            is what marks the party as hand-entered; the type is derived at the
            outgoing boundary, never picked by the user. */}
        <Input
          value={partnerName}
          onChange={(e) => onPartnerNameChange?.(e.target.value)}
          placeholder="Nhập tên hoặc chọn từ mã"
          maxLength={255}
          title={partnerId ? kindLabel : undefined}
        />
      </div>
    </FormField>
  );
}
