import { useState, type Dispatch, type SetStateAction } from "react";
import { ArrowDownToLine, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  LineItemGrid,
  type LineColumn,
  Input,
  MoneyInput,
  formatMoneyInteger,
} from "@erp/ui";
import { LookupField } from "../../../../../../../../components/forms/LookupField";
import { PromotionTargetPicker } from "../../../../../../components/PromotionTargetPicker/PromotionTargetPicker";
import {
  mergeTargetsIntoGrid,
  promoPrice,
} from "../../../../../../components/PromotionTargetPicker/promotion-target";
import { useTrailingEmptyRow } from "../../../../../../../../hooks/useTrailingEmptyRow";
import { apiClient } from "../../../../../../../../lib/api-axios";
import { erpApi, requireErpData } from "../../../../../../../../lib/erp-api";
import { getUserFacingApiErrorMessage } from "../../../../../../../../lib/user-facing-api-error";
import {
  downloadItemDiscountExcel,
  type ImportedItemDiscountLine,
} from "../../../../../../api/item-discount-excel.api";
import { ItemDiscountImportDialog } from "./ItemDiscountImportDialog";
import { PromotionDiscountMode, PromotionTargetType, type PaginatedResponse } from "@erp/shared-interfaces";
import {
  GOODS_DISCOUNT_METHOD_OPTIONS,
  blankGoodsDiscountRow,
} from "../../../../../program-form.constants";
import {
  GoodsDiscountMethod,
  GoodsDiscountScope,
} from "../../../../../program-form.types";
import type {
  GoodsDiscountRow,
  ProgramFormState,
} from "../../../../../program-form.types";

interface Props {
  form: ProgramFormState;
  onChange: (patch: Partial<ProgramFormState>) => void;
}

/** Một hàng hóa trả về từ tra cứu `/inventory/items`. */
interface ItemOption {
  id: string;
  code: string;
  name: string;
  unit: string;
  /** Cột `decimal` không có transformer — server trả chuỗi (`"685000.00"`). */
  sellingPrice: number | string | null;
}

interface ItemsResponse {
  data: ItemOption[];
  page: number;
  pageSize: number;
  total: number;
}

/** Search hàng hóa cho LookupField — mirror `ApplicableGoodsGrid.tsx`. */
async function searchItems(query: string, page: number, pageSize?: number) {
  const effectivePageSize = pageSize ?? 20;
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(effectivePageSize),
  });
  if (query.trim()) params.set("search", query.trim());
  const { data } = await apiClient.get<ItemsResponse>(
    `/inventory/items?${params}`,
  );
  const fetched = data.page * data.pageSize;
  return { items: data.data, hasMore: fetched < data.total, total: data.total };
}

/** Một nhóm hàng hóa trả về từ nền tảng CRUD chung — cùng entity `TreeSelectInput` dùng. */
interface CategoryOption {
  id: string;
  code: string;
  name: string;
}

/** Search nhóm hàng hóa cho LookupField, qua `/admin/entities/inventory-item-categories/records`. */
async function searchCategories(query: string, page: number, pageSize?: number) {
  const effectivePageSize = pageSize ?? 20;
  const res = await requireErpData(
    await erpApi.GET<PaginatedResponse<Record<string, unknown>>>(
      "/admin/entities/{entityKey}/records",
      {
        params: {
          path: { entityKey: "inventory-item-categories" },
          query: {
            page,
            pageSize: effectivePageSize,
            ...(query.trim() ? { search: query.trim() } : {}),
          },
        },
      },
    ),
  );
  const items = res.data.map(
    (r): CategoryOption => ({
      id: String(r.id ?? ""),
      code: String(r.code ?? ""),
      name: String(r.name ?? ""),
    }),
  );
  const fetched = page * effectivePageSize;
  return { items, hasMore: fetched < res.total, total: res.total };
}

const CELL_INPUT_CLASS =
  "h-9 rounded-none border-0 shadow-none focus-visible:ring-1 focus-visible:ring-inset";

/**
 * Bảng thiết lập giảm giá hàng hóa: hàng "Thiết lập" (phương thức) + bảng dòng
 * hàng hóa/nhóm hàng hóa.
 *
 * Ô mã dùng `LookupField` tìm-gõ-chọn (mirror `ApplicableGoodsGrid.tsx` và
 * mẫu nhập/xuất/chuyển kho) thay vì nút "+ Thêm dòng"/"Chọn nhóm hàng hóa" —
 * bấm biểu tượng tìm kiếm trong ô vẫn mở `PromotionTargetPicker` để chọn
 * hàng loạt (AC-32). Đánh đổi: mất "Nhân bản dòng" — `LineItemGrid` dùng
 * chung chỉ có xóa dòng (A-36).
 */
export function GoodsDiscountGrid({ form, onChange }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const rows = form.goodsDiscountRows;
  const isGroup = form.goodsDiscountScope === GoodsDiscountScope.GROUP;
  const method = form.goodsDiscountMethod;
  const isAmount = method === GoodsDiscountMethod.AMOUNT;
  const isFixedPrice = method === GoodsDiscountMethod.FIXED_PRICE;

  const setMethod = (value: GoodsDiscountMethod) =>
    onChange({ goodsDiscountMethod: value });

  const setRows: Dispatch<SetStateAction<GoodsDiscountRow[]>> = (updater) => {
    onChange({
      goodsDiscountRows:
        typeof updater === "function"
          ? (updater as (prev: GoodsDiscountRow[]) => GoodsDiscountRow[])(rows)
          : updater,
    });
  };

  // Giữ đúng một dòng trống cuối; chọn hàng ở dòng cuối → tự thêm dòng mới.
  useTrailingEmptyRow(rows, setRows, {
    isEmpty: (row) => !row.targetId,
    makeEmpty: blankGoodsDiscountRow,
  });

  const updateRow = (id: string, patch: Partial<GoodsDiscountRow>) => {
    onChange({
      goodsDiscountRows: rows.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    });
  };

  const removeRow = (id: string) => {
    onChange({ goodsDiscountRows: rows.filter((row) => row.id !== id) });
  };

  // Nhập/Xuất khẩu có ở phạm vi "Hàng hóa" với cả 3 phương thức (AC-11).
  const excelEnabled = !isGroup;
  const excelMethod = isFixedPrice
    ? PromotionDiscountMode.FIXED_PRICE
    : isAmount
      ? PromotionDiscountMode.AMOUNT
      : PromotionDiscountMode.PERCENT;
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadItemDiscountExcel(
        excelMethod,
        rows.filter((row) => row.targetId),
      );
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err) || "Xuất khẩu thất bại");
    } finally {
      setExporting(false);
    }
  };

  // Nhập khẩu gộp theo mã (A-01): dòng đã có → ghi đè giá trị; dòng mới → thêm
  // trước dòng trống cuối. Không lưu chương trình.
  const [importOpen, setImportOpen] = useState(false);

  const applyImported = (imported: ImportedItemDiscountLine[]) => {
    const lineById = new Map(imported.map((line) => [line.targetId, line]));
    // Đồng giá không có giá trị theo dòng → dòng đã có giữ nguyên (A-09).
    const updated = rows.map((row) => {
      const value = row.targetId ? lineById.get(row.targetId)?.value : undefined;
      return value === undefined ? row : { ...row, value };
    });
    onChange({
      goodsDiscountRows: mergeTargetsIntoGrid<GoodsDiscountRow>(
        updated,
        imported.map((line) => ({
          targetType: line.targetType,
          targetId: line.targetId,
          code: line.code,
          name: line.name,
          unit: line.unit ?? "",
          sellingPrice: line.sellingPrice ?? 0,
        })),
        {
          targetIdOf: (row) => row.targetId,
          isBlank: (row) => !row.targetId && !row.code.trim() && !row.name.trim(),
          toRow: (draft) => ({
            ...blankGoodsDiscountRow(),
            targetId: draft.targetId,
            targetType: draft.targetType,
            code: draft.code,
            name: draft.name,
            unit: draft.unit,
            // Dòng mẫu mã (PRODUCT) không có giá bán → để trống (A-04).
            sellingPrice: lineById.get(draft.targetId)?.sellingPrice ?? null,
            value: lineById.get(draft.targetId)?.value ?? "",
          }),
        },
      ),
    });
  };

  // Copy xuống — chép giá trị của dòng sang mọi dòng bên dưới đã chọn hàng (A-07).
  const copyValueDown = (id: string) => {
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) return;
    const { value } = rows[index];
    onChange({
      goodsDiscountRows: rows.map((row, i) =>
        i > index && row.targetId ? { ...row, value } : row,
      ),
    });
  };

  // FR-031 — phạm vi "Nhóm hàng hóa" chọn nhóm; còn lại chọn hàng hóa/mẫu mã.
  // ĐVT/Giá bán chỉ có ở mẫu mã (`ITEM`); hàng hóa chọn trọn và nhóm để trống (A-04).
  const addFromPicker = (drafts: Parameters<typeof mergeTargetsIntoGrid>[1]) => {
    onChange({
      goodsDiscountRows: mergeTargetsIntoGrid<GoodsDiscountRow>(rows, drafts, {
        targetIdOf: (row) => row.targetId,
        isBlank: (row) => !row.targetId && !row.code.trim() && !row.name.trim(),
        toRow: (draft) => {
          const isItem = draft.targetType === PromotionTargetType.ITEM;
          return {
            ...blankGoodsDiscountRow(),
            targetId: draft.targetId,
            targetType: draft.targetType,
            code: draft.code,
            name: draft.name,
            unit: isItem ? draft.unit : "",
            sellingPrice: isItem ? draft.sellingPrice : null,
          };
        },
      }),
    });
    setPickerOpen(false);
  };

  const codeLabel = isGroup ? "Mã nhóm hàng hóa" : "Mã hàng";
  const nameLabel = isGroup ? "Tên nhóm hàng hóa" : "Tên hàng hóa";
  const valueLabel = isAmount ? "Số tiền giảm" : "% giảm giá";

  // Giá KM chỉ đọc, tính khi render bằng `promoPrice()` để làm tròn khớp domain
  // (ADR-03). Đồng giá → ô Đồng giá cho mọi dòng đã chọn, kể cả `PRODUCT` (A-11);
  // % / Số tiền → trống khi chưa có giá bán (`PRODUCT`, A-04) hoặc chưa nhập giá trị.
  const promoPriceText = (row: GoodsDiscountRow): string => {
    if (!row.targetId) return "";
    const value = isFixedPrice ? form.goodsFixedPrice : row.value;
    if (value === "") return "";
    if (!isFixedPrice && row.sellingPrice == null) return "";
    const mode = isFixedPrice
      ? PromotionDiscountMode.FIXED_PRICE
      : isAmount
        ? PromotionDiscountMode.AMOUNT
        : PromotionDiscountMode.PERCENT;
    return formatMoneyInteger(promoPrice(row.sellingPrice ?? 0, mode, value));
  };

  // Độ rộng theo bộ cột đang hiện, để lưới 8 cột của phạm vi "Hàng hóa" không
  // tràn ở 1440px.
  const priceWidth = isFixedPrice ? "14%" : "13%";

  // ĐVT / Giá bán / Giá KM chỉ có ở phạm vi "Hàng hóa" (AC-08).
  const unitAndPriceColumns: LineColumn<GoodsDiscountRow>[] = isGroup
    ? []
    : [
        {
          key: "unit",
          label: "ĐVT",
          type: "readonly",
          width: isFixedPrice ? "10%" : "8%",
          filterSymbol: "*",
        },
        {
          key: "sellingPrice",
          label: "Giá bán",
          type: "readonly",
          width: priceWidth,
          align: "right",
          filterSymbol: "≤",
          getValue: (row) =>
            row.sellingPrice == null ? "" : formatMoneyInteger(row.sellingPrice),
        },
      ];
  const promoPriceColumns: LineColumn<GoodsDiscountRow>[] = isGroup
    ? []
    : [
        {
          key: "promoPrice",
          label: "Giá khuyến mại",
          type: "readonly",
          width: priceWidth,
          align: "right",
          filterSymbol: "≤",
          getValue: promoPriceText,
        },
      ];

  const columns: LineColumn<GoodsDiscountRow>[] = [
    {
      key: "code",
      label: codeLabel,
      width: isGroup ? "28%" : isFixedPrice ? "22%" : "20%",
      filterSymbol: "*",
      placeholder: isGroup ? "Tìm mã hoặc tên nhóm hàng hóa" : "Tìm mã hoặc tên hàng hóa",
      renderEditor: (row) =>
        isGroup ? (
          <LookupField<CategoryOption>
            value={row.code}
            placeholder="Tìm mã hoặc tên nhóm hàng hóa"
            search={searchCategories}
            onValueChange={(text) => updateRow(row.id, { code: text })}
            onSelect={(item) =>
              updateRow(row.id, {
                targetId: item.id,
                targetType: PromotionTargetType.CATEGORY,
                code: item.code,
                name: item.name,
                unit: "",
                sellingPrice: null,
              })
            }
            itemKey={(item) => item.id}
            renderItem={(item) => item.name}
            renderMeta={(item) => item.code}
            columns={[
              { key: "code", label: "Mã", render: (i) => i.code },
              { key: "name", label: "Tên nhóm hàng hóa", render: (i) => i.name },
            ]}
            onSearchButtonClick={() => setPickerOpen(true)}
          />
        ) : (
          <LookupField<ItemOption>
            value={row.code}
            placeholder="Tìm mã hoặc tên hàng hóa"
            search={searchItems}
            onValueChange={(text) => updateRow(row.id, { code: text })}
            onSelect={(item) =>
              updateRow(row.id, {
                targetId: item.id,
                targetType: PromotionTargetType.ITEM,
                code: item.code,
                name: item.name,
                unit: item.unit ?? "",
                sellingPrice: item.sellingPrice == null ? null : Number(item.sellingPrice),
              })
            }
            itemKey={(item) => item.id}
            renderItem={(item) => item.name}
            renderMeta={(item) => `${item.code} · ${item.unit}`}
            columns={[
              { key: "code", label: "Mã", render: (i) => i.code },
              { key: "name", label: "Tên hàng hóa", render: (i) => i.name },
              { key: "unit", label: "ĐVT", render: (i) => i.unit },
            ]}
            onSearchButtonClick={() => setPickerOpen(true)}
          />
        ),
    },
    {
      key: "name",
      label: nameLabel,
      type: "readonly",
      width: isGroup ? "37%" : isFixedPrice ? "38%" : "27%",
      filterSymbol: "*",
    },
    ...unitAndPriceColumns,
    // Đồng giá không có giá trị theo dòng nên bỏ cột giá trị ở mọi phạm vi (A-12)
    // và cả cột copy xuống.
    ...(isFixedPrice
      ? []
      : [
          {
            key: "value",
            label: valueLabel,
            width: isGroup ? "20%" : "14%",
            align: "right",
            renderEditor: (row) =>
              isAmount ? (
                <MoneyInput
                  className={`${CELL_INPUT_CLASS} text-right`}
                  value={row.value}
                  onChange={(v) => updateRow(row.id, { value: v })}
                />
              ) : (
                <div className="flex items-center">
                  <span className="px-2 text-muted-foreground">≤</span>
                  <Input
                    type="number"
                    min={0}
                    className={`${CELL_INPUT_CLASS} text-right tabular-nums`}
                    value={row.value}
                    onChange={(e) =>
                      updateRow(row.id, {
                        value: e.target.value === "" ? "" : Number(e.target.value),
                      })
                    }
                  />
                </div>
              ),
          } satisfies LineColumn<GoodsDiscountRow>,
        ]),
    ...promoPriceColumns,
    ...(isFixedPrice
      ? []
      : [
          {
            key: "copy",
            label: "",
            width: 40,
            align: "center",
            type: "readonly",
            filterSymbol: " ",
            renderEditor: (row) =>
              row.targetId ? (
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center text-primary transition-colors hover:bg-primary/10"
                  onClick={() => copyValueDown(row.id)}
                  title="Sao chép giá trị xuống các dòng dưới"
                  aria-label="Sao chép giá trị xuống các dòng dưới"
                >
                  <ArrowDownToLine className="h-3.5 w-3.5" />
                </button>
              ) : (
                <span />
              ),
          } satisfies LineColumn<GoodsDiscountRow>,
        ]),
  ];

  return (
    <div className="rounded border border-border">
      {/* Hàng "Thiết lập" */}
      <div className="flex flex-wrap items-center gap-4 border-b border-border bg-muted px-3 py-2 text-sm">
        <span className="font-bold text-foreground">Thiết lập</span>
        {GOODS_DISCOUNT_METHOD_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-center gap-2"
          >
            <input
              type="radio"
              name="goods-discount-method"
              className="shrink-0 accent-primary"
              checked={method === opt.value}
              onChange={() => setMethod(opt.value)}
            />
            {opt.label}
          </label>
        ))}
        <MoneyInput
          className="w-40"
          disabled={!isFixedPrice}
          value={form.goodsFixedPrice}
          onChange={(v) => onChange({ goodsFixedPrice: v })}
        />
        {excelEnabled ? (
          <div className="ml-auto flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setImportOpen(true)}
            >
              <Upload className="mr-1 h-4 w-4" />
              Nhập khẩu
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={exporting}
              onClick={handleExport}
            >
              <Download className="mr-1 h-4 w-4" />
              Xuất khẩu
            </Button>
          </div>
        ) : null}
      </div>

      <LineItemGrid<GoodsDiscountRow>
        columns={columns}
        rows={rows}
        onDeleteRow={(rowIndex) => {
          const row = rows[rowIndex];
          if (row) removeRow(row.id);
        }}
        showAddRow={false}
        emptyText="Chưa có hàng hóa"
      />

      {importOpen ? (
        <ItemDiscountImportDialog
          method={excelMethod}
          onOpenChange={setImportOpen}
          onApply={applyImported}
        />
      ) : null}

      {pickerOpen ? (
        <PromotionTargetPicker
          open
          onOpenChange={setPickerOpen}
          mode={isGroup ? "CATEGORY" : "PRODUCT_OR_ITEM"}
          title={isGroup ? "Chọn nhóm hàng hóa" : "Chọn hàng hóa"}
          selectedIds={new Set(rows.map((row) => row.targetId).filter(Boolean))}
          onSelect={addFromPicker}
        />
      ) : null}
    </div>
  );
}
