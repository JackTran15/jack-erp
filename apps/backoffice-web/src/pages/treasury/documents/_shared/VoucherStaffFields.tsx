import { useCallback, useMemo } from "react";
import { FormField, Input } from "@erp/ui";
import { LookupField } from "../../../../components/forms/LookupField";
import type { LookupSearchResult } from "../../../../components/forms/LookupField";
import { READONLY_INPUT_CLASS } from "../../ledger-cash/ledger-cash.constants";
import { PartnerLookupType } from "./voucher-partner.constants";
import {
  mergePartnerSearchWithSelection,
  usePartnerSearch,
  type VoucherPartnerOption,
} from "./voucher-partner-search";

export interface VoucherStaffSelection {
  staffId: string;
  staffCode: string;
  staffName: string;
}

interface Props {
  label: string;
  readOnly: boolean;
  staffId: string;
  staffCode: string;
  staffName: string;
  onStaffSelect: (selection: VoucherStaffSelection) => void;
  onStaffLookupChange: (code: string) => void;
  onStaffClear: () => void;
  onOpenSearchDialog: () => void;
  onCreateNew?: () => void;
}

const STAFF_LOOKUP_COLUMNS = [
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
    key: "phone",
    label: "Điện thoại",
    className: "w-32",
    render: (item: VoucherPartnerOption) => item.phone ?? "—",
  },
];

export function VoucherStaffFields({
  label,
  readOnly,
  staffId,
  staffCode,
  staffName,
  onStaffSelect,
  onStaffLookupChange,
  onStaffClear,
  onOpenSearchDialog,
  onCreateNew,
}: Props) {
  const searchPartners = usePartnerSearch();
  const currentSelection = useMemo((): VoucherPartnerOption | null => {
    if (!staffId) return null;
    return {
      lookupKey: `${PartnerLookupType.EMPLOYEE}:${staffId}`,
      id: staffId,
      code: staffCode,
      name: staffName,
      kind: PartnerLookupType.EMPLOYEE,
      kindLabel: "Nhân viên",
    };
  }, [staffId, staffCode, staffName]);

  const searchStaffOnly = useCallback(
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
        (!q || q === staffCode || q === staffName)
      ) {
        if (!q) {
          return { items: [currentSelection], hasMore: false, total: 1 };
        }
      }

      const raw = await searchPartners(
        PartnerLookupType.EMPLOYEE,
        query,
        page,
        ps,
      );
      return mergePartnerSearchWithSelection(raw, currentSelection, page);
    },
    [currentSelection, staffCode, staffName, searchPartners],
  );

  const handleSelect = useCallback(
    (item: VoucherPartnerOption) => {
      onStaffSelect({
        staffId: item.id,
        staffCode: item.code,
        staffName: item.name,
      });
    },
    [onStaffSelect],
  );

  if (readOnly) {
    return (
      <FormField label={label} layout="horizontal" labelWidth="8rem">
        <div className="grid grid-cols-[minmax(7rem,1fr)_2fr] gap-2">
          <Input
            value={staffCode}
            readOnly
            disabled
            className={READONLY_INPUT_CLASS}
          />
          <Input
            value={staffName}
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
          value={staffCode}
          onValueChange={(v) => {
            onStaffLookupChange(v);
            if (!v.trim()) onStaffClear();
          }}
          onSelect={handleSelect}
          search={searchStaffOnly}
          itemKey={(item) => item.lookupKey}
          renderItem={(item) => item.code || "—"}
          columns={STAFF_LOOKUP_COLUMNS}
          placeholder="Mã"
          disabled={readOnly}
          portalToBody
          dropdownMinWidth={400}
          onSearchButtonClick={onOpenSearchDialog}
          onCreateNew={onCreateNew}
        />
        <Input
          value={staffName}
          readOnly
          disabled
          placeholder="Tên"
          className={READONLY_INPUT_CLASS}
          title={staffId ? undefined : "Chọn từ danh sách"}
        />
      </div>
    </FormField>
  );
}
