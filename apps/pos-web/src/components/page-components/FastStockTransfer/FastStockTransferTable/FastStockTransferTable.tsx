import { useMemo } from "react";
import {
  PosDataTable,
  type PosDataTableColumn,
} from "@erp/pos/components/common/PosDataTable/PosDataTable";
import { PosTextInput } from "@erp/pos/components/common/PosTextInput/PosTextInput";
import type { FastStockTransferFilters, FastStockTransferRow } from "@erp/pos/lib/fast-stock-transfer/fast-stock-transfer.types";
import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import { PosDataTableFilterCell } from "@erp/pos/components/common/PosDataTable/PosDataTableFilterCell/PosDataTableFilterCell";
import {
  FilterOperatorEnum,
  FilterOperatorTypeEnum,
} from "@erp/pos/constants/checkout.constant";

type EditableFields = Pick<
  FastStockTransferRow,
  "transporter" | "sku" | "location"
>;

interface FastStockTransferTableProps {
  rows: ReadonlyArray<FastStockTransferRow>;
  editingRowId: string | null;
  editableDraft: EditableFields | null;
  filters: FastStockTransferFilters;
  setFilter: <K extends keyof FastStockTransferFilters>(
    key: K,
    value: FastStockTransferFilters[K],
  ) => void;
  onStartEdit: (rowId: string) => void;
  onEditField: (key: keyof EditableFields, value: string) => void;
  onSaveRow: (rowId: string) => void;
  onToggleTransfer: (rowId: string, checked: boolean) => void;
}

export function FastStockTransferTable({
  rows,
  editingRowId,
  editableDraft,
  filters,
  setFilter,
  onStartEdit,
  onEditField,
  onSaveRow,
  onToggleTransfer,
}: FastStockTransferTableProps) {
  const columns = useMemo<ReadonlyArray<PosDataTableColumn<FastStockTransferRow>>>(
    () => [
      {
        key: "timestamp",
        title: "Thời gian",
        render: (row) => row.timestamp,
      },
      {
        key: "transporter",
        title: "Người vận chuyển",
        render: (row) =>
          editingRowId === row.id && editableDraft ? (
            <PosTextInput
              value={editableDraft.transporter}
              onChange={(value) => onEditField("transporter", value)}
              variant="underline"
            />
          ) : (
            row.transporter
          ),
        filterRender: (
          <PosDataTableFilterCell
            value={filters.transporter}
            onChange={(value) => setFilter("transporter", value)}
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
            <PosTextInput
              value={editableDraft.sku}
              onChange={(value) => onEditField("sku", value)}
              variant="underline"
            />
          ) : (
            row.sku
          ),
        filterRender: (
          <PosDataTableFilterCell
            value={filters.sku}
            onChange={(value) => setFilter("sku", value)}
            operatorType={FilterOperatorTypeEnum.TEXT}
            leadingOperator={FilterOperatorEnum.CONTAINS}
          />
        ),
      },
      {
        key: "productName",
        title: "Tên hàng hóa",
        render: (row) => row.productName,
        filterRender: (
          <PosDataTableFilterCell
            value={filters.productName}
            onChange={(value) => setFilter("productName", value)}
            operatorType={FilterOperatorTypeEnum.TEXT}
            leadingOperator={FilterOperatorEnum.CONTAINS}
          />
        ),
      },
      {
        key: "location",
        title: "Vị trí",
        render: (row) =>
          editingRowId === row.id && editableDraft ? (
            <PosTextInput
              value={editableDraft.location}
              onChange={(value) => onEditField("location", value)}
              variant="underline"
            />
          ) : (
            row.location
          ),
        filterRender: (
          <PosDataTableFilterCell
            value={filters.location}
            onChange={(value) => setFilter("location", value)}
            operatorType={FilterOperatorTypeEnum.TEXT}
            leadingOperator={FilterOperatorEnum.CONTAINS}
          />
        ),
      },
      {
        key: "unit",
        title: "ĐVT",
        render: (row) => row.unit,
        filterRender: (
          <PosDataTableFilterCell
            value={filters.unit}
            onChange={(value) => setFilter("unit", value)}
            operatorType={FilterOperatorTypeEnum.TEXT}
            leadingOperator={FilterOperatorEnum.CONTAINS}
          />
        ),
      },
      {
        key: "quantity",
        title: "Số lượng",
        align: "right",
        render: (row) => row.quantity,
      },
      {
        key: "isTransferSelected",
        title: "Chuyển kho",
        headerClassName: "text-center",
        cellClassName: "text-center",
        render: (row) => (
          <PosCheckbox
            checked={row.isTransferSelected}
            onChange={(value) => onToggleTransfer(row.id, value)}
          />
        ),
      },
      {
        key: "actions",
        title: "",
        align: "right",
        headerClassName: "w-[110px]",
        cellClassName: "w-[110px]",
        render: (row) =>
          editingRowId === row.id && editableDraft ? (
            <button
              type="button"
              onClick={() => onSaveRow(row.id)}
              className="inline-flex h-8 min-w-[72px] items-center justify-center rounded-md bg-[#4F46E5] px-4 text-[12px] font-semibold text-white hover:bg-[#4338CA]"
            >
              Lưu lại
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onStartEdit(row.id)}
              className="inline-flex h-8 min-w-[72px] items-center justify-center rounded-md border border-[#C7D2FE] px-4 text-[12px] font-semibold text-[#4F46E5] hover:bg-[#EEF2FF]"
            >
              Sửa
            </button>
          ),
      },
    ],
    [
      editableDraft,
      editingRowId,
      onEditField,
      onSaveRow,
      onStartEdit,
      onToggleTransfer,
    ],
  );

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-md border border-[#E5E7EB]">
      <PosDataTable<FastStockTransferRow>
        columns={columns}
        dataSource={rows}
        rowKey={(row) => row.id}
        emptyText="Chưa có dữ liệu chuyển kho."
      />
    </div>
  );
}
