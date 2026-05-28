import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import {
  type PosDataTableColumn,
} from "@erp/pos/components/common/PosDataTable/PosDataTable";
import { PosDataTableFilterCell } from "@erp/pos/components/common/PosDataTable/PosDataTableFilterCell/PosDataTableFilterCell";
import {
  PosSearchPopover,
  type SearchSuggestion,
} from "@erp/pos/components/common/PosSearchPopover/PosSearchPopover";
import {
  FilterOperatorEnum,
  FilterOperatorTypeEnum,
} from "@erp/pos/constants/checkout.constant";
import { formatViDateTime } from "@erp/pos/lib/common/dateTime";
import { formatOnHand } from "@erp/pos/lib/page-libs/checkout/checkoutUtils";
import type { FastStockTransferTableRow } from "@erp/pos/types/fast-stock-transfer.type";
import {
  formatCarrierName,
  lineProductName,
  lineQuantityDisplay,
  lineSku,
  lineUnit,
  locationLabelForLine,
} from "@erp/pos/lib/page-libs/fast-stock-transfer/temp-warehouse-mappers";
import { usePosFastStockTransferWorkflowStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-workflow.store";
import { useEffect, useMemo, useState } from "react";
import { useFastStockTransferActions } from "./use-fast-stock-transfer-actions";
import { useFastStockTransferCarriers } from "./use-fast-stock-transfer-carriers";
import { useFastStockTransferData } from "./use-fast-stock-transfer-data";
import { useFastStockTransferProductPicker } from "./use-fast-stock-transfer-product-picker";
import type { PosCatalogLine } from "@erp/pos/interfaces/catalog.interface";
import type { TempWarehousePublicUser } from "@erp/shared-interfaces";

interface TransporterEditCellProps {
  value: TempWarehousePublicUser | null;
  onSelect: (carrier: TempWarehousePublicUser) => void;
  search: (
    query: string,
  ) => Promise<SearchSuggestion<TempWarehousePublicUser>[]>;
}

/** Inline carrier picker for the editing row — owns its own input string. */
function TransporterEditCell({
  value,
  onSelect,
  search,
}: TransporterEditCellProps) {
  const [query, setQuery] = useState(value ? formatCarrierName(value) : "");
  useEffect(() => {
    setQuery(value ? formatCarrierName(value) : "");
  }, [value]);
  return (
    <PosSearchPopover
      value={query}
      onValueChange={setQuery}
      search={search}
      onSelect={(c) => {
        onSelect(c);
        setQuery(formatCarrierName(c));
      }}
      itemKey={(c) => c.id}
      renderItem={(c) => formatCarrierName(c)}
      placeholder="Chọn"
      ariaLabel="Người vận chuyển"
      variant="underline"
      minChars={0}
      containerClassName="w-full min-w-[140px]"
    />
  );
}

interface SkuEditCellProps {
  value: PosCatalogLine | null;
  onSelect: (product: PosCatalogLine) => void;
  search: (query: string) => Promise<SearchSuggestion<PosCatalogLine>[]>;
}

/** Inline SKU picker for the editing row — owns its own input string. */
function SkuEditCell({ value, onSelect, search }: SkuEditCellProps) {
  const [query, setQuery] = useState(value ? value.code : "");
  useEffect(() => {
    setQuery(value ? value.code : "");
  }, [value]);
  return (
    <PosSearchPopover
      value={query}
      onValueChange={setQuery}
      search={search}
      onSelect={(p) => {
        onSelect(p);
        setQuery(p.code);
      }}
      itemKey={(p) => p.itemId}
      renderItem={(p) => <span className="font-medium">{p.name}</span>}
      renderMeta={(p) =>
        `${p.code} · Tồn: ${formatOnHand(p.quantityOnHand, p.unit)}`
      }
      placeholder="SKU"
      ariaLabel="Mã SKU"
      variant="underline"
      minChars={0}
      containerClassName="w-full min-w-[160px]"
    />
  );
}

export function useFastStockTransferTableColumns() {
  const data = useFastStockTransferData();
  const actions = useFastStockTransferActions();
  const { carrierSearchAdapter } = useFastStockTransferCarriers();
  const { productSearchAdapter } = useFastStockTransferProductPicker();

  const filters = usePosFastStockTransferWorkflowStore((s) => s.filters);
  const editingRowId = usePosFastStockTransferWorkflowStore(
    (s) => s.editingRowId,
  );
  const editableDraft = usePosFastStockTransferWorkflowStore(
    (s) => s.editableDraft,
  );

  return useMemo<ReadonlyArray<PosDataTableColumn<FastStockTransferTableRow>>>(
    () => [
      {
        key: "timestamp",
        title: "Thời gian",
        render: (row) => formatViDateTime(row.createdAt),
      },
      {
        key: "transporter",
        title: "Người vận chuyển",
        render: (row) =>
          editingRowId === row.id && editableDraft ? (
            <TransporterEditCell
              value={editableDraft.carrier}
              onSelect={actions.handleEditDraftCarrier}
              search={carrierSearchAdapter}
            />
          ) : (
            formatCarrierName(row.carrier)
          ),
        filterRender: (
          <PosDataTableFilterCell
            value={filters.transporter}
            onChange={(value) => actions.setFilter("transporter", value)}
            operatorType={FilterOperatorTypeEnum.TEXT}
            leadingOperator={FilterOperatorEnum.CONTAINS}
          />
        ),
      },
      {
        key: "sku",
        title: "Mã SKU",
        render: (row) =>
          editingRowId === row.id && editableDraft ? (
            <SkuEditCell
              value={editableDraft.product}
              onSelect={actions.handleEditDraftProduct}
              search={productSearchAdapter}
            />
          ) : (
            lineSku(row)
          ),
        filterRender: (
          <PosDataTableFilterCell
            value={filters.sku}
            onChange={(value) => actions.setFilter("sku", value)}
            operatorType={FilterOperatorTypeEnum.TEXT}
            leadingOperator={FilterOperatorEnum.CONTAINS}
          />
        ),
      },
      {
        key: "productName",
        title: "Tên hàng hóa",
        render: (row) => lineProductName(row),
        filterRender: (
          <PosDataTableFilterCell
            value={filters.productName}
            onChange={(value) => actions.setFilter("productName", value)}
            operatorType={FilterOperatorTypeEnum.TEXT}
            leadingOperator={FilterOperatorEnum.CONTAINS}
          />
        ),
      },
      {
        key: "location",
        title: "Vị trí",
        render: (row) => locationLabelForLine(row),
        filterRender: (
          <PosDataTableFilterCell
            value={filters.location}
            onChange={(value) => actions.setFilter("location", value)}
            operatorType={FilterOperatorTypeEnum.TEXT}
            leadingOperator={FilterOperatorEnum.CONTAINS}
          />
        ),
      },
      {
        key: "unit",
        title: "ĐVT",
        render: (row) => lineUnit(row),
        filterRender: (
          <PosDataTableFilterCell
            value={filters.unit}
            onChange={(value) => actions.setFilter("unit", value)}
            operatorType={FilterOperatorTypeEnum.TEXT}
            leadingOperator={FilterOperatorEnum.CONTAINS}
          />
        ),
      },
      {
        key: "quantity",
        title: "Số lượng",
        align: "right",
        render: (row) => lineQuantityDisplay(row),
      },
      {
        key: "isTransferSelected",
        title: "Chuyển kho",
        headerClassName: "text-center",
        cellClassName: "text-center",
        render: (row) => (
          <PosCheckbox
            checked={row.isTransferSelected}
            disabled={data.isLineBalanced(row.id)}
            onChange={(value) => actions.handleToggleTransfer(row.id, value)}
          />
        ),
      },
      {
        key: "actions",
        title: "",
        align: "right",
        headerClassName: "w-[110px]",
        cellClassName: "w-[110px]",
        render: (row) => {
          if (data.isLineBalanced(row.id)) return null;
          if (editingRowId === row.id && editableDraft) {
            return (
              <button
                type="button"
                onClick={() => actions.handleSaveRow(row.id)}
                className="inline-flex h-8 min-w-[72px] items-center justify-center rounded-md bg-[#4F46E5] px-4 text-[12px] font-semibold text-white hover:bg-[#4338CA]"
              >
                Lưu lại
              </button>
            );
          }
          return (
            <button
              type="button"
              onClick={() => actions.handleStartEdit(row.id)}
              className="inline-flex h-8 min-w-[72px] items-center justify-center rounded-md border border-[#C7D2FE] px-4 text-[12px] font-semibold text-[#4F46E5] hover:bg-[#EEF2FF]"
            >
              Sửa
            </button>
          );
        },
      },
    ],
    [
      actions,
      carrierSearchAdapter,
      data,
      editableDraft,
      editingRowId,
      filters.location,
      filters.productName,
      filters.sku,
      filters.transporter,
      filters.unit,
      productSearchAdapter,
    ],
  );
}
