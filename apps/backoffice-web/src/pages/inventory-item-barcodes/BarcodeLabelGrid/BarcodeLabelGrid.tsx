import { LineItemGrid, type LineColumn } from "@erp/ui";
import { ArrowDownToLine, Loader2 } from "lucide-react";
import { useMemo } from "react";
import { LookupField } from "../../../components/forms/LookupField";
import type { BarcodeLabelRow } from "../_lib/barcode-label-row.type";
import type {
  ItemLocationOption,
  ItemStorageOption,
} from "../_lib/item-stock-locations";

/** Kết quả search cho LookupField (Kho / Vị trí). */
interface LookupResult<T> {
  items: T[];
  hasMore: boolean;
  total: number;
}

const priceFormatter = new Intl.NumberFormat("vi-VN");

/** Item trả về từ GET /inventory/items dùng cho ô tìm kiếm Mã SKU. */
export interface BarcodeItemOption {
  id: string;
  code: string;
  name: string;
  unit: string;
  sellingPrice?: number | string;
}

export interface BarcodeItemSearchResult {
  items: BarcodeItemOption[];
  hasMore: boolean;
  total: number;
}

/** id của input SKU ở dòng trống — target cho phím tắt Ctrl+Insert / Ctrl+F3. */
export const BARCODE_SKU_INPUT_ID = "barcode-label-sku-input";

interface Props {
  /** Rows đã lọc client-side, luôn kết thúc bằng một dòng trống. */
  rows: BarcodeLabelRow[];
  filters: Record<string, string>;
  onFiltersChange: (filters: Record<string, string>) => void;
  searchItems: (
    query: string,
    page: number,
    pageSize?: number,
  ) => Promise<BarcodeItemSearchResult>;
  /** Text tự do trong ô SKU của dòng trống (chưa chọn item). */
  onSkuTextChange: (rowId: string, text: string) => void;
  onSelectItem: (rowId: string, item: BarcodeItemOption) => void;
  /** Tìm kho có tồn của một hàng hóa. */
  searchItemStorages: (
    itemId: string,
    query: string,
  ) => Promise<LookupResult<ItemStorageOption>>;
  /** Tìm vị trí có tồn của một hàng hóa trong một kho. */
  searchItemLocations: (
    itemId: string,
    storageId: string,
    query: string,
  ) => Promise<LookupResult<ItemLocationOption>>;
  onSelectStorage: (rowId: string, storage: ItemStorageOption) => void;
  onStorageTextChange: (rowId: string, text: string) => void;
  onSelectLocation: (rowId: string, location: ItemLocationOption) => void;
  onLocationTextChange: (rowId: string, text: string) => void;
  onQuantityChange: (rowId: string, quantity: number) => void;
  /** Áp số lượng tem của dòng này xuống các dòng bên dưới. */
  onCopyQuantityDown: (rowId: string) => void;
  onDeleteRow: (rowId: string) => void;
  onRowFocus: (rowId: string) => void;
  /** Mở dialog "Chọn hàng hóa" (icon kính lúp trong ô SKU / Ctrl+F3). */
  onOpenProductPicker: () => void;
  /** Ẩn cột Kho + Vị trí (chuỗi cửa hàng — dữ liệu gắn với 1 chi nhánh). */
  hideLocationColumns: boolean;
}

/** Bảng hàng hoá in tem — cấu hình cột trên LineItemGrid. */
export function BarcodeLabelGrid({
  rows,
  filters,
  onFiltersChange,
  searchItems,
  onSkuTextChange,
  onSelectItem,
  searchItemStorages,
  searchItemLocations,
  onSelectStorage,
  onStorageTextChange,
  onSelectLocation,
  onLocationTextChange,
  onQuantityChange,
  onCopyQuantityDown,
  onDeleteRow,
  onRowFocus,
  onOpenProductPicker,
  hideLocationColumns,
}: Props) {
  // Nhiều dòng chưa chọn hàng có thể cùng render LookupField — chỉ dòng cuối
  // (dòng nhập liệu) mang id làm target cho phím tắt Ctrl+Insert / Ctrl+F3.
  const lastRowIndex = rows.length - 1;

  const allColumns = useMemo<LineColumn<BarcodeLabelRow>[]>(
    () => [
      {
        key: "stt",
        label: "STT",
        width: 52,
        align: "center",
        type: "readonly",
        filterSymbol: "*",
        renderEditor: (_row, rowIndex) => (
          <span className="block px-2 py-1.5 text-center text-muted-foreground">
            {rowIndex + 1}
          </span>
        ),
      },
      {
        key: "sku",
        label: "Mã SKU",
        width: 200,
        filterSymbol: "*",
        renderEditor: (row, rowIndex) =>
          row.itemId ? (
            <span
              className="block truncate px-2 py-1.5"
              onClick={() => onRowFocus(row.rowId)}
            >
              {row.sku}
            </span>
          ) : (
            <div className="flex h-full items-center">
              <LookupField
                inputId={
                  rowIndex === lastRowIndex ? BARCODE_SKU_INPUT_ID : undefined
                }
                placeholder="Tìm mã hoặc tên hàng hóa"
                value={row.sku}
                onValueChange={(text) => onSkuTextChange(row.rowId, text)}
                onSelect={(item) => onSelectItem(row.rowId, item)}
                search={searchItems}
                onSearchButtonClick={onOpenProductPicker}
                itemKey={(item) => item.id}
                renderItem={(item) => item.name}
                renderMeta={(item) => `${item.code} · ${item.unit}`}
                columns={[
                  {
                    key: "code",
                    label: "Mã",
                    className: "w-[130px] font-mono",
                    render: (item) => item.code,
                  },
                  { key: "name", label: "Tên", render: (item) => item.name },
                  {
                    key: "unit",
                    label: "ĐVT",
                    className: "w-[60px]",
                    render: (item) => item.unit,
                  },
                ]}
                className="h-full flex-1"
              />
            </div>
          ),
      },
      {
        key: "name",
        label: "Tên hàng hóa",
        width: 240,
        type: "readonly",
        filterSymbol: "*",
        getValue: (row) => row.name,
      },
      {
        key: "unit",
        label: "Đơn vị tính",
        width: 90,
        type: "readonly",
        filterSymbol: "*",
        getValue: (row) => row.unit,
      },
      {
        key: "sellingPrice",
        label: "Giá bán",
        width: 120,
        align: "right",
        type: "readonly",
        filterSymbol: "≤",
        getValue: (row) =>
          row.itemId ? priceFormatter.format(row.sellingPrice) : "",
      },
      {
        key: "storageName",
        label: "Kho",
        width: 150,
        filterSymbol: "*",
        renderEditor: (row) =>
          !row.itemId ? (
            <span />
          ) : row.locationLoading ? (
            <span className="block px-2 py-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            </span>
          ) : (
            <div className="flex h-full items-center">
              <LookupField<ItemStorageOption>
                portalToBody
                hideSearchButton
                value={row.storageName}
                onValueChange={(text) => onStorageTextChange(row.rowId, text)}
                onSelect={(s) => onSelectStorage(row.rowId, s)}
                search={(q) => searchItemStorages(row.itemId, q)}
                itemKey={(s) => s.storageId}
                renderItem={(s) => s.storageName}
                columns={[
                  {
                    key: "code",
                    label: "Mã kho",
                    className: "w-[110px] font-mono",
                    render: (s) => s.code,
                  },
                  {
                    key: "storageName",
                    label: "Tên kho",
                    render: (s) => s.storageName,
                  },
                ]}
                className="h-full flex-1"
              />
            </div>
          ),
      },
      {
        key: "locationCode",
        label: "Vị trí",
        width: 130,
        filterSymbol: "*",
        renderEditor: (row) =>
          !row.itemId ? (
            <span />
          ) : row.locationLoading ? (
            <span className="block px-2 py-1.5" />
          ) : (
            <div className="flex h-full items-center">
              <LookupField<ItemLocationOption>
                portalToBody
                hideSearchButton
                disabled={!row.storageId}
                value={row.locationCode}
                onValueChange={(text) => onLocationTextChange(row.rowId, text)}
                onSelect={(loc) => onSelectLocation(row.rowId, loc)}
                search={(q) =>
                  searchItemLocations(row.itemId, row.storageId, q)
                }
                itemKey={(loc) => loc.locationId}
                renderItem={(loc) => loc.code}
                columns={[
                  {
                    key: "code",
                    label: "Mã",
                    className: "w-[90px] font-mono",
                    render: (loc) => loc.code,
                  },
                  {
                    key: "name",
                    label: "Tên vị trí",
                    render: (loc) => loc.name,
                  },
                ]}
                className="h-full flex-1"
              />
            </div>
          ),
      },
      {
        key: "quantity",
        label: "Số lượng tem",
        width: 110,
        align: "right",
        filterSymbol: "≤",
        renderEditor: (row) =>
          row.itemId ? (
            <input
              type="number"
              min={0}
              className="h-8 w-full bg-transparent px-2 text-right text-sm outline-none focus:bg-background focus:ring-1 focus:ring-inset focus:ring-ring"
              value={row.quantity}
              onFocus={() => onRowFocus(row.rowId)}
              onChange={(e) =>
                onQuantityChange(
                  row.rowId,
                  Math.max(0, Math.floor(Number(e.target.value) || 0)),
                )
              }
              onKeyDown={(e) => {
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  onQuantityChange(row.rowId, row.quantity + 1);
                }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  onQuantityChange(row.rowId, Math.max(0, row.quantity - 1));
                }
              }}
              aria-label="Số lượng tem"
            />
          ) : (
            <span className="block px-2 py-1.5" />
          ),
      },
      {
        key: "copy",
        label: "",
        width: 40,
        align: "center",
        type: "readonly",
        filterSymbol: " ",
        renderEditor: (row) =>
          row.itemId ? (
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center text-primary transition-colors hover:bg-primary/10"
              onClick={() => onCopyQuantityDown(row.rowId)}
              aria-label="Sao chép số lượng xuống các dòng dưới"
            >
              <ArrowDownToLine className="h-3.5 w-3.5" />
            </button>
          ) : (
            <span />
          ),
      },
    ],
    [
      lastRowIndex,
      onCopyQuantityDown,
      onOpenProductPicker,
      onQuantityChange,
      onRowFocus,
      onSelectItem,
      onSkuTextChange,
      searchItems,
      searchItemStorages,
      searchItemLocations,
      onSelectStorage,
      onStorageTextChange,
      onSelectLocation,
      onLocationTextChange,
    ],
  );

  // Chuỗi cửa hàng: bỏ cột Kho + Vị trí (dữ liệu gắn với 1 chi nhánh cụ thể).
  const columns = useMemo(
    () =>
      hideLocationColumns
        ? allColumns.filter(
            (c) => c.key !== "storageName" && c.key !== "locationCode",
          )
        : allColumns,
    [allColumns, hideLocationColumns],
  );

  return (
    <LineItemGrid
      columns={columns}
      rows={rows}
      filters={filters}
      onFilterChange={onFiltersChange}
      onDeleteRow={(rowIndex) => {
        const row = rows[rowIndex];
        if (row) onDeleteRow(row.rowId);
      }}
      showRowActions
      showAddRow={false}
      emptyText="Tìm mã hoặc tên hàng hóa để thêm vào danh sách in tem"
    />
  );
}
