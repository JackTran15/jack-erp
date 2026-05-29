import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { FieldDefinition } from "@erp/shared-interfaces";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FormField,
  Input,
  MoneyInput,
  Textarea,
} from "@erp/ui";
import {
  Calculator,
  ChevronDown,
  ImagePlus,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { CrudFieldInput } from "../CrudFieldInput";
import { useCrudCreate, useCrudRecords } from "../useCrudApi";
import { getUserFacingApiErrorMessage } from "../../../lib/user-facing-api-error";

import {
  BRAND_SUGGESTIONS,
  COMMISSION_METHOD_OPTIONS,
  COMMISSION_POSITION_OPTIONS,
  DEFAULT_EXTRAS,
  GROUP_SUGGESTIONS,
  IMAGE_ACCEPT,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_COUNT,
  TABS,
  type TabId,
  UNIT_PRESETS,
} from "./item-create/constants";
import {
  ConversionUnitsTable,
  createBlankConversionUnitRow,
  type ConversionUnitRow,
} from "./item-create/ConversionUnitsTable";
import { ProvidersPlaceholderTable } from "./item-create/ProvidersPlaceholderTable";
import {
  ProductVariantsTable,
  VARIANT_DEFAULT_UNIT,
  type ProductVariantRow,
} from "./item-create/ProductVariantsTable";
import { InventoryItemActionBar } from "./item-create/InventoryItemActionBar";
import { InventoryItemCreateDialogs } from "./item-create/InventoryItemCreateDialogs";
import { InventoryItemTabsHeader } from "./item-create/InventoryItemTabsHeader";
import type {
  CommissionRow,
  FormExtras,
  InventoryItemCreateFormProps as Props,
} from "./item-create/types";

export function InventoryItemCreateForm({
  editableFields,
  values,
  setValues,
  errors,
  setErrors,
  entityKey,
  isSaving = false,
}: Props) {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<TabId>("basic");
  const [extras, setExtras] = useState<FormExtras>(DEFAULT_EXTRAS);
  const [activeSubTab, setActiveSubTab] = useState<"conversion" | "providers">("conversion");

  const [categoryPickOpen, setCategoryPickOpen] = useState(false);
  const [quickCategoryOpen, setQuickCategoryOpen] = useState(false);
  const [quickCategoryDraft, setQuickCategoryDraft] = useState("");

  const [providerPickOpen, setProviderPickOpen] = useState(false);
  const [quickProviderOpen, setQuickProviderOpen] = useState(false);
  const [providerSearch, setProviderSearch] = useState("");
  const [providerSummary, setProviderSummary] = useState<{ name: string; code: string } | null>(
    null,
  );
  const [quickProviderCode, setQuickProviderCode] = useState("");
  const [quickProviderName, setQuickProviderName] = useState("");

  const [groupPickOpen, setGroupPickOpen] = useState(false);
  const [quickGroupOpen, setQuickGroupOpen] = useState(false);
  const [quickGroupDraft, setQuickGroupDraft] = useState("");
  const [brandPickOpen, setBrandPickOpen] = useState(false);
  const [quickBrandOpen, setQuickBrandOpen] = useState(false);
  const [quickBrandDraft, setQuickBrandDraft] = useState("");

  const [productImages, setProductImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const previewsRef = useRef<string[]>([]);

  const [unitRows, setUnitRows] = useState<ConversionUnitRow[]>([
    createBlankConversionUnitRow(),
  ]);

  const [variantRows, setVariantRows] = useState<ProductVariantRow[]>([]);
  const removedVariantKeys = useRef<Set<string>>(new Set());

  const editableFieldsByKey = useMemo(
    () => new Map(editableFields.map((f) => [f.key, f])),
    [editableFields],
  );

  // ─── Sync local "extras" + unitRows into the parent `values` payload ────
  // The keys below MUST match the API DTO (CreateItemDto). CrudCreatePage
  // forwards the whole `values` object for entityKey === "inventory-items".
  useEffect(() => {
    const toNumberOrUndef = (raw: string): number | undefined => {
      if (raw === "" || raw === null || raw === undefined) return undefined;
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    };

    const units = unitRows
      .filter((r) => r.unitName.trim().length > 0)
      .map((r) => ({
        unitName: r.unitName.trim(),
        ratio: toNumberOrUndef(r.ratio) ?? 1,
        description: r.description.trim() || undefined,
        purchasePrice: toNumberOrUndef(r.buyPrice) ?? 0,
        sellPrice: toNumberOrUndef(r.sellPrice) ?? 0,
        isDefaultSell: r.defaultSell,
        isDefaultBuy: r.defaultBuy,
      }));

    const minQty = toNumberOrUndef(extras.minStock);
    const maxQty = toNumberOrUndef(extras.maxStock);
    const threshold =
      minQty !== undefined || maxQty !== undefined
        ? { minQty, maxQty }
        : undefined;

    setValues((prev) => ({
      ...prev,
      // Top-level primitives mapped to DTO keys
      isPosVisible: extras.showOnPos,
      manageBarcodePerUnit: extras.manageBarcodePerUnit,
      isGoldSilver: extras.isGoldSilver,
      oddSize: extras.oddSize || undefined,
      packageWeightGram: toNumberOrUndef(extras.weightG),
      packageLengthCm: toNumberOrUndef(extras.pkgLength),
      packageWidthCm: toNumberOrUndef(extras.pkgWidth),
      packageHeightCm: toNumberOrUndef(extras.pkgHeight),
      // Nested
      units: units.length > 0 ? units : undefined,
      threshold,
      initialStock: toNumberOrUndef(extras.initialStock),
      initialStockUnitPrice: toNumberOrUndef(extras.initialStockUnitPrice),
    }));
    // We intentionally re-sync whenever extras or unitRows change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extras, unitRows]);

  // ─── Auto-generate variant rows from the "Thông tin thuộc tính" inputs ──────
  // Cartesian product of Màu sắc × Size. User edits (price/name/barcode) are kept
  // by merging on a stable combo key, but unit & SKU always track the product;
  // manually deleted combos are remembered so they don't reappear.
  useEffect(() => {
    const colors = splitAttributeValues(extras.attrColor);
    const sizes = splitAttributeValues(extras.attrSize);

    const combos: Array<{ color: string; size: string }> = [];
    if (colors.length && sizes.length) {
      for (const color of colors) for (const size of sizes) combos.push({ color, size });
    } else if (colors.length) {
      for (const color of colors) combos.push({ color, size: "" });
    } else if (sizes.length) {
      for (const size of sizes) combos.push({ color: "", size });
    }

    // The product SKU is stored in the `code` field (config key "code").
    const baseSku = String(values.code ?? "");
    const baseUnit = String(values.unit ?? "").trim() || VARIANT_DEFAULT_UNIT;

    setVariantRows((prev) => {
      const byKey = new Map(prev.map((r) => [variantComboKey(r.color, r.size), r]));
      const next: ProductVariantRow[] = [];
      for (const { color, size } of combos) {
        const key = variantComboKey(color, size);
        if (removedVariantKeys.current.has(key)) continue;
        const existing = byKey.get(key);
        if (existing) {
          // Unit & SKU are always derived from the product (unit + sku), never
          // kept per-row — they re-sync whenever the product values change.
          next.push({
            ...existing,
            unit: baseUnit,
            sku: autoVariantSku(baseSku, color, size),
          });
        } else {
          next.push({
            id: `variant-${key}`,
            color,
            size,
            name: `(${[color, size].filter(Boolean).join("/")})`,
            unit: baseUnit,
            sku: autoVariantSku(baseSku, color, size),
            barcode: "",
            purchasePrice: "0",
            sellPrice: "0",
            initialStock: "0",
          });
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extras.attrColor, extras.attrSize, values.code, values.unit]);

  // Sync variant rows into the submitted payload under `variants`.
  useEffect(() => {
    const toNumberOrUndef = (raw: string): number | undefined => {
      if (raw === "" || raw === null || raw === undefined) return undefined;
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    };
    setValues((prev) => ({
      ...prev,
      variants:
        variantRows.length > 0
          ? variantRows.map((r) => ({
              name: r.name,
              color: r.color || undefined,
              size: r.size || undefined,
              unit: r.unit,
              sku: r.sku,
              barcode: r.barcode || undefined,
              purchasePrice: toNumberOrUndef(r.purchasePrice) ?? 0,
              sellPrice: toNumberOrUndef(r.sellPrice) ?? 0,
              initialStock: toNumberOrUndef(r.initialStock) ?? 0,
            }))
          : undefined,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantRows]);

  const removeVariant = (row: ProductVariantRow) => {
    removedVariantKeys.current.add(variantComboKey(row.color, row.size));
    setVariantRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  // Copy the current row's prices down onto every row below it.
  const copyPriceDown = (row: ProductVariantRow) => {
    setVariantRows((prev) => {
      const idx = prev.findIndex((r) => r.id === row.id);
      if (idx < 0) return prev;
      const { purchasePrice, sellPrice } = prev[idx];
      return prev.map((r, i) => (i > idx ? { ...r, purchasePrice, sellPrice } : r));
    });
  };

  const renderedDynamicKeys = useRef(new Set<string>());

  const categoryDialogsOpen = categoryPickOpen || quickCategoryOpen;

  const { data: categoryFetch } = useCrudRecords(
    "inventory-items",
    { page: 1, pageSize: 100, sortBy: undefined, sortOrder: "desc", search: "", filters: {} },
    categoryPickOpen,
  );

  const { data: categoryRegistryFetch } = useCrudRecords(
    "inventory-item-categories",
    {
      page: 1,
      pageSize: 100,
      sortBy: "name",
      sortOrder: "asc",
      search: "",
      filters: {},
    },
    categoryDialogsOpen,
  );

  const createCategoryMutation = useCrudCreate("inventory-item-categories");

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of categoryRegistryFetch?.data ?? []) {
      const n = row.name;
      if (typeof n === "string" && n.trim()) set.add(n.trim());
    }
    for (const row of categoryFetch?.data ?? []) {
      const c = row.category;
      if (typeof c === "string" && c.trim()) set.add(c.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b, "vi"));
  }, [categoryRegistryFetch?.data, categoryFetch?.data]);

  const { data: providerFetch, isLoading: providersLoading } = useCrudRecords(
    "inventory-providers",
    {
      page: 1,
      pageSize: 100,
      sortBy: undefined,
      sortOrder: "desc",
      search: providerSearch,
      filters: {},
    },
    providerPickOpen,
  );

  const createProviderMutation = useCrudCreate("inventory-providers");

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  useEffect(() => {
    return () => {
      previewsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const updateExtras = <K extends keyof FormExtras>(key: K, value: FormExtras[K]) => {
    setExtras((prev) => ({ ...prev, [key]: value }));
  };

  const handlePickCategory = (label: string) => {
    setValues((prev) => ({ ...prev, category: label }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.category;
      return next;
    });
    setCategoryPickOpen(false);
  };

  const applyQuickCategory = async () => {
    const name = quickCategoryDraft.trim();
    if (!name) {
      toast.warning("Vui lòng nhập tên danh mục.");
      return;
    }
    try {
      await createCategoryMutation.mutateAsync({ name });
      handlePickCategory(name);
      setQuickCategoryOpen(false);
      setQuickCategoryDraft("");
      toast.success("Đã tạo danh mục và áp dụng cho biểu mẫu.");
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    }
  };

  const handlePickProvider = (row: Record<string, unknown>) => {
    const id = String(row.id ?? "");
    const name = String(row.name ?? "");
    const code = String(row.code ?? "");
    setValues((prev) => ({ ...prev, providerId: id }));
    setProviderSummary({ name, code });
    setErrors((prev) => {
      const next = { ...prev };
      delete next.providerId;
      return next;
    });
    setProviderPickOpen(false);
  };

  const clearProvider = () => {
    setValues((prev) => ({ ...prev, providerId: "" }));
    setProviderSummary(null);
  };

  const addImages = (files: FileList | null) => {
    if (!files?.length) return;
    setImageError(null);
    setProductImages((prevFiles) => {
      const next: File[] = [...prevFiles];
      const newPreviewUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith("image/")) {
          setImageError("Chỉ chấp nhận file ảnh.");
          continue;
        }
        if (file.size > MAX_IMAGE_BYTES) {
          setImageError(`Mỗi ảnh tối đa 2MB (${file.name}).`);
          continue;
        }
        if (next.length >= MAX_IMAGE_COUNT) {
          setImageError(`Tối đa ${MAX_IMAGE_COUNT} ảnh.`);
          break;
        }
        next.push(file);
        newPreviewUrls.push(URL.createObjectURL(file));
      }
      if (newPreviewUrls.length) {
        setPreviews((p) => [...p, ...newPreviewUrls]);
      }
      return next;
    });
  };

  const removeImageAt = (index: number) => {
    const url = previews[index];
    if (url) URL.revokeObjectURL(url);
    setProductImages((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => prev.filter((_, i) => i !== index));
    setImageError(null);
  };

  const addCommissionRow = () => {
    setExtras((prev) => ({
      ...prev,
      commissions: [
        ...prev.commissions,
        {
          id: `commission-${Date.now()}`,
          position: COMMISSION_POSITION_OPTIONS[0],
          method: COMMISSION_METHOD_OPTIONS[0].value,
          amount: "0",
          discountLimit: "0",
        },
      ],
    }));
  };

  const removeCommissionRow = (id: string) => {
    setExtras((prev) => ({
      ...prev,
      commissions: prev.commissions.filter((c) => c.id !== id),
    }));
  };

  const updateCommissionRow = (
    id: string,
    patch: Partial<Omit<CommissionRow, "id">>,
  ) => {
    setExtras((prev) => ({
      ...prev,
      commissions: prev.commissions.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  };

  const iconBtn =
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-background text-foreground hover:bg-accent";

  const trailingCategory = (
    <>
      <button
        type="button"
        className={iconBtn}
        aria-label="Tìm danh mục"
        onClick={() => setCategoryPickOpen(true)}
      >
        <Search className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={iconBtn}
        aria-label="Thêm nhanh danh mục"
        onClick={() => {
          setQuickCategoryDraft(String(values.category ?? ""));
          setQuickCategoryOpen(true);
        }}
      >
        <Plus className="h-4 w-4" />
      </button>
    </>
  );

  const trailingUnit = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={iconBtn} aria-label="Chọn đơn vị gợi ý">
          <ChevronDown className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
        {UNIT_PRESETS.map((u) => (
          <DropdownMenuItem
            key={u}
            onClick={() => {
              setValues((prev) => ({ ...prev, unit: u }));
              setErrors((prev) => {
                const next = { ...prev };
                delete next.unit;
                return next;
              });
            }}
          >
            {u}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const trailingGroup = (
    <>
      <button
        type="button"
        className={iconBtn}
        aria-label="Gợi ý nhóm hàng"
        onClick={() => setGroupPickOpen(true)}
      >
        <Search className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={iconBtn}
        aria-label="Nhập nhanh nhóm hàng"
        onClick={() => {
          setQuickGroupDraft(String(values.itemType ?? ""));
          setQuickGroupOpen(true);
        }}
      >
        <Plus className="h-4 w-4" />
      </button>
    </>
  );

  const trailingBrand = (
    <>
      <button
        type="button"
        className={iconBtn}
        aria-label="Gợi ý thương hiệu"
        onClick={() => setBrandPickOpen(true)}
      >
        <Search className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={iconBtn}
        aria-label="Nhập nhanh thương hiệu"
        onClick={() => {
          setQuickBrandDraft(String(values.brand ?? ""));
          setQuickBrandOpen(true);
        }}
      >
        <Plus className="h-4 w-4" />
      </button>
    </>
  );

  // ─── Helpers render dynamic fields (left column of "Basic Information" tab) ─────

  /** Render field theo `editableFields` nếu key tồn tại; fallback null. */
  const renderDynamicField = (key: string, trailing?: ReactNode) => {
    const field = editableFieldsByKey.get(key);
    if (!field) return null;
    renderedDynamicKeys.current.add(key);
    return (
      <CrudFieldInput
        key={field.key}
        inputIdPrefix="create"
        field={field}
        value={values[field.key]}
        error={errors[field.key]}
        trailing={trailing}
        onChange={(nextValue) => {
          setValues((prev) => ({ ...prev, [field.key]: nextValue }));
          setErrors((prev) => {
            const next = { ...prev };
            delete next[field.key];
            return next;
          });
        }}
      />
    );
  };

  /** Renders any editable field NOT already shown by an explicit slot (placeholder fields). */
  const renderRemainingFields = () => {
    const skip = renderedDynamicKeys.current;
    // Keys whose value is synced from local `extras`/unitRows in another tab —
    // skip rendering them as plain inputs in the basic tab's remainder grid.
    const managedElsewhere = new Set([
      "description",
      "packageWeightGram",
      "packageLengthCm",
      "packageWidthCm",
      "packageHeightCm",
      "oddSize",
      "isGoldSilver",
      "manageBarcodePerUnit",
      "isPosVisible",
      // Has an explicit slot in the right column of the basic tab.
      "providerId",
    ]);
    return editableFields
      .filter(
        (f) =>
          !skip.has(f.key) &&
          f.key !== "isActive" &&
          !managedElsewhere.has(f.key),
      )
      .map((field) => (
        <CrudFieldInput
          key={field.key}
          inputIdPrefix="create"
          field={field}
          value={values[field.key]}
          error={errors[field.key]}
          onChange={(nextValue) => {
            setValues((prev) => ({ ...prev, [field.key]: nextValue }));
            setErrors((prev) => {
              const next = { ...prev };
              delete next[field.key];
              return next;
            });
          }}
        />
      ));
  };

  // ─── Tab contents ──────────────────────────────────────────────────────────

  // Reset rendered keys each render-pass before computing tab basic.
  renderedDynamicKeys.current = new Set();

  const basicTab = (
    <>
      <section className="rounded-md border border-border bg-background p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Thông tin
        </h3>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            {renderDynamicField("name")}
            {renderDynamicField("category", trailingCategory)}
            {renderDynamicField("itemType", trailingGroup)}
            {renderDynamicField("brand", trailingBrand)}
            {renderDynamicField("sku")}
            {renderDynamicField("barcode")}
            {renderDynamicField("purchasePrice")}
            {renderDynamicField("sellPrice", (
              <button
                type="button"
                className={iconBtn}
                aria-label="Tính giá bán"
                title="Trợ lý tính giá (sắp ra mắt)"
              >
                <Calculator className="h-4 w-4" />
              </button>
            ))}
            {renderDynamicField("unit", trailingUnit)}
          </div>

          <div className="flex flex-col gap-3">
            <FormField label="Tồn kho ban đầu" htmlFor="extra-initial-stock">
              <Input
                id="extra-initial-stock"
                type="number"
                value={extras.initialStock}
                onChange={(e) => updateExtras("initialStock", e.target.value)}
                inputMode="decimal"
              />
            </FormField>
            <FormField label="Đơn giá nhập đầu kỳ" htmlFor="extra-initial-stock-price">
              <MoneyInput
                id="extra-initial-stock-price"
                value={
                  extras.initialStockUnitPrice === "" || extras.initialStockUnitPrice == null
                    ? ""
                    : Number(extras.initialStockUnitPrice)
                }
                onChange={(v) =>
                  updateExtras("initialStockUnitPrice", v === "" ? "" : String(v))
                }
              />
            </FormField>

            {/* Nhà cung cấp + checkbox "Đang hoạt động" */}
            {editableFieldsByKey.has("providerId") && (
              <FormField
                label={editableFieldsByKey.get("providerId")!.label}
                htmlFor="create-provider-id"
                error={errors.providerId}
                required={editableFieldsByKey.get("providerId")!.required}
              >
                <div className="flex items-start gap-1.5">
                  <div className="min-w-0 flex-1">
                    <Input
                      id="create-provider-id"
                      readOnly
                      value={
                        providerSummary
                          ? `${providerSummary.name} (${providerSummary.code})`
                          : values.providerId
                            ? String(values.providerId)
                            : ""
                      }
                      placeholder="Chọn nhà cung cấp…"
                      className="bg-muted/30"
                    />
                  </div>
                  <button
                    type="button"
                    className={iconBtn}
                    aria-label="Tìm nhà cung cấp"
                    onClick={() => {
                      setProviderSearch("");
                      setProviderPickOpen(true);
                    }}
                  >
                    <Search className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className={iconBtn}
                    aria-label="Thêm nhà cung cấp mới"
                    onClick={() => {
                      setQuickProviderCode("");
                      setQuickProviderName("");
                      setQuickProviderOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  {(providerSummary || String(values.providerId ?? "").length > 0) && (
                    <button
                      type="button"
                      className={iconBtn}
                      aria-label="Bỏ chọn NCC"
                      onClick={clearProvider}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </FormField>
            )}

            {editableFieldsByKey.has("isActive") && (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(values.isActive)}
                  onChange={(event) =>
                    setValues((prev) => ({ ...prev, isActive: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border border-input accent-primary"
                />
                Đang hoạt động
              </label>
            )}
          </div>
        </div>

        {/* Trường động còn lại (placeholder để không mất dữ liệu nếu config thay đổi) */}
        {(() => {
          const rest = renderRemainingFields();
          if (rest.length === 0) return null;
          return (
            <div className="mt-4 grid gap-3 border-t pt-4 md:grid-cols-2">
              {rest}
            </div>
          );
        })()}
      </section>

      {/* Sub-tabs: Đơn vị chuyển đổi / Nhà cung cấp */}
      <section className="rounded-md border border-border bg-background">
        <div className="flex items-center gap-1 border-b px-2 pt-2">
          {([
            { id: "conversion", label: "Đơn vị chuyển đổi" },
            { id: "providers", label: "Nhà cung cấp" },
          ] as const).map((sub) => (
            <button
              key={sub.id}
              type="button"
              onClick={() => setActiveSubTab(sub.id)}
              className={
                activeSubTab === sub.id
                  ? "rounded-t border border-b-0 border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground"
                  : "px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              }
            >
              {sub.label}
            </button>
          ))}
        </div>

        <div className="p-3">
          {activeSubTab === "conversion" ? (
            <ConversionUnitsTable rows={unitRows} setRows={setUnitRows} />
          ) : (
            <ProvidersPlaceholderTable />
          )}
        </div>
      </section>

      {/* Ảnh hàng hóa + checkbox hiển thị POS */}
      <section className="rounded-md border border-border bg-background p-4">
        <h3 className="mb-1 text-sm font-semibold">Ảnh hàng hóa</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Định dạng .jpg, .jpeg, .png, .gif, .webp — tối đa 2MB mỗi ảnh, tối đa {MAX_IMAGE_COUNT}{" "}
          ảnh. Ảnh chỉ lưu trên trình duyệt cho đến khi máy chủ hỗ trợ tải lên.
        </p>
        {imageError ? <p className="mb-2 text-sm text-destructive">{imageError}</p> : null}
        <div className="flex flex-wrap gap-3">
          <label className="flex h-28 w-28 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/40 bg-muted/20 text-center text-xs text-muted-foreground hover:bg-muted/40">
            <ImagePlus className="mb-1 h-7 w-7 text-primary" />
            Thêm hình ảnh ({productImages.length}/{MAX_IMAGE_COUNT})
            <input
              type="file"
              accept={IMAGE_ACCEPT}
              multiple
              className="sr-only"
              onChange={(e) => {
                addImages(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {previews.map((src, i) => (
            <div
              key={src}
              className="relative h-28 w-28 overflow-hidden rounded-lg border border-border"
            >
              <img src={src} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 shadow"
                aria-label="Xóa ảnh"
                onClick={() => removeImageAt(i)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={extras.showOnPos}
            onChange={(e) => updateExtras("showOnPos", e.target.checked)}
            className="h-4 w-4 rounded border border-input accent-primary"
          />
          Hiển thị trên màn hình bán hàng
        </label>
      </section>

      {/* THÔNG TIN THUỘC TÍNH */}
      <section className="rounded-md border border-border bg-background p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Thông tin thuộc tính
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          <FormField label="Màu sắc" htmlFor="extra-attr-color">
            <Input
              id="extra-attr-color"
              value={extras.attrColor}
              onChange={(e) => updateExtras("attrColor", e.target.value)}
              placeholder="VD: Xanh, Đỏ, Vàng…"
            />
          </FormField>
          <FormField label="Size" htmlFor="extra-attr-size">
            <Input
              id="extra-attr-size"
              value={extras.attrSize}
              onChange={(e) => updateExtras("attrSize", e.target.value)}
              placeholder="VD: S, M, L, XL…"
            />
          </FormField>
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={extras.manageBarcodePerUnit}
            onChange={(e) => updateExtras("manageBarcodePerUnit", e.target.checked)}
            className="h-4 w-4 rounded border border-input accent-primary"
          />
          Quản lý mã vạch theo từng đơn vị tính
        </label>

        {variantRows.length > 0 && (
          <div className="mt-4 border-t pt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Danh sách phiên bản
            </h4>
            <ProductVariantsTable
              rows={variantRows}
              setRows={setVariantRows}
              onRemove={removeVariant}
              onCopyPriceDown={copyPriceDown}
            />
          </div>
        )}
      </section>
    </>
  );

  const additionalTab = (
    <section className="rounded-md border border-border bg-background p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label="Trọng lượng gói hàng (g)" htmlFor="extra-weight">
          <Input
            id="extra-weight"
            type="number"
            inputMode="decimal"
            value={extras.weightG}
            onChange={(e) => updateExtras("weightG", e.target.value)}
          />
        </FormField>

        <FormField label="Kích thước đóng gói (cm)">
          <div className="grid grid-cols-3 gap-2">
            <Input
              aria-label="Chiều dài"
              placeholder="Chiều dài"
              type="number"
              inputMode="decimal"
              value={extras.pkgLength}
              onChange={(e) => updateExtras("pkgLength", e.target.value)}
            />
            <Input
              aria-label="Chiều rộng"
              placeholder="Chiều rộng"
              type="number"
              inputMode="decimal"
              value={extras.pkgWidth}
              onChange={(e) => updateExtras("pkgWidth", e.target.value)}
            />
            <Input
              aria-label="Chiều cao"
              placeholder="Chiều cao"
              type="number"
              inputMode="decimal"
              value={extras.pkgHeight}
              onChange={(e) => updateExtras("pkgHeight", e.target.value)}
            />
          </div>
        </FormField>

        <FormField label="Đầy size" htmlFor="extra-odd-size">
          <Input
            id="extra-odd-size"
            value={extras.oddSize}
            onChange={(e) => updateExtras("oddSize", e.target.value)}
          />
        </FormField>

        <FormField label="Năm sản xuất" htmlFor="extra-year-made">
          <Input
            id="extra-year-made"
            type="number"
            inputMode="numeric"
            value={String(values.manufactureYear ?? "")}
            onChange={(e) => {
              const raw = e.target.value;
              setValues((prev) => ({
                ...prev,
                manufactureYear: raw === "" ? "" : Number(raw),
              }));
            }}
            placeholder="VD: 2024"
          />
        </FormField>

        <FormField label="Thành phần" htmlFor="extra-composition" className="md:col-span-2">
          <Textarea
            id="extra-composition"
            rows={3}
            value={String(values.composition ?? "")}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, composition: e.target.value }))
            }
          />
        </FormField>

        <label className="flex cursor-pointer items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={extras.isGoldSilver}
            onChange={(e) => updateExtras("isGoldSilver", e.target.checked)}
            className="h-4 w-4 rounded border border-input accent-primary"
          />
          Là mặt hàng vàng bạc
        </label>

        <FormField label="Mô tả" htmlFor="extra-long-desc" className="md:col-span-2">
          <Textarea
            id="extra-long-desc"
            rows={4}
            value={String(values.description ?? "")}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, description: e.target.value }))
            }
            placeholder="Mô tả chi tiết về mặt hàng…"
          />
        </FormField>
      </div>
    </section>
  );

  const warehouseTab = (
    <section className="rounded-md border border-border bg-background p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Định mức tồn kho
      </h3>
      <div className="grid gap-3 md:grid-cols-2 md:max-w-xl">
        <FormField label="Tối thiểu" htmlFor="extra-min-stock">
          <Input
            id="extra-min-stock"
            type="number"
            inputMode="decimal"
            value={extras.minStock}
            onChange={(e) => updateExtras("minStock", e.target.value)}
          />
        </FormField>
        <FormField label="Tối đa" htmlFor="extra-max-stock">
          <Input
            id="extra-max-stock"
            type="number"
            inputMode="decimal"
            value={extras.maxStock}
            onChange={(e) => updateExtras("maxStock", e.target.value)}
          />
        </FormField>
      </div>
      <p className="mt-3 text-xs italic text-muted-foreground">
        Hệ thống cảnh báo khi tồn kho thực tế chạm các ngưỡng cấu hình ở đây.
      </p>
    </section>
  );

  const commissionTab = (
    <section className="rounded-md border border-border bg-background p-4">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Vị trí công việc</th>
              <th className="px-3 py-2 text-left">Cách tính hoa hồng</th>
              <th className="px-3 py-2 text-right">Mức tính</th>
              <th className="px-3 py-2 text-right">
                Giới hạn giảm giá được tính hoa hồng (%)
              </th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {extras.commissions.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={row.position}
                    onChange={(e) =>
                      updateCommissionRow(row.id, { position: e.target.value })
                    }
                  >
                    {COMMISSION_POSITION_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={row.method}
                    onChange={(e) =>
                      updateCommissionRow(row.id, { method: e.target.value })
                    }
                  >
                    {COMMISSION_METHOD_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    className="text-right"
                    value={row.amount}
                    onChange={(e) =>
                      updateCommissionRow(row.id, { amount: e.target.value })
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    className="text-right"
                    value={row.discountLimit}
                    onChange={(e) =>
                      updateCommissionRow(row.id, { discountLimit: e.target.value })
                    }
                  />
                </td>
                <td className="px-2 py-2 text-right">
                  <button
                    type="button"
                    aria-label="Xóa dòng hoa hồng"
                    className="inline-flex h-8 w-8 items-center justify-center rounded text-destructive hover:bg-destructive/10"
                    onClick={() => removeCommissionRow(row.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {extras.commissions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Chưa có cấu hình hoa hồng.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3">
        <Button type="button" variant="outline" size="sm" onClick={addCommissionRow}>
          <Plus className="mr-1 h-4 w-4" /> Thêm dòng
        </Button>
      </div>
    </section>
  );

  // ─── JSX ───────────────────────────────────────────────────────────────────

  return (
    <>
      <InventoryItemTabsHeader activeTab={activeTab} onChangeTab={setActiveTab} />

      <div className="flex flex-col gap-4 pb-28">
        {activeTab === "basic" && basicTab}
        {activeTab === "additional" && additionalTab}
        {activeTab === "warehouse" && warehouseTab}
        {activeTab === "commission" && commissionTab}
      </div>

      <InventoryItemActionBar isSaving={isSaving} onCancel={() => navigate(`/admin/${entityKey}`)} />

      <InventoryItemCreateDialogs
        categoryPickOpen={categoryPickOpen}
        setCategoryPickOpen={setCategoryPickOpen}
        categoryOptions={categoryOptions}
        handlePickCategory={handlePickCategory}
        quickCategoryOpen={quickCategoryOpen}
        setQuickCategoryOpen={setQuickCategoryOpen}
        quickCategoryDraft={quickCategoryDraft}
        setQuickCategoryDraft={setQuickCategoryDraft}
        providerPickOpen={providerPickOpen}
        setProviderPickOpen={setProviderPickOpen}
        providerSearch={providerSearch}
        setProviderSearch={setProviderSearch}
        providersLoading={providersLoading}
        providerFetch={providerFetch}
        handlePickProvider={handlePickProvider}
        quickProviderOpen={quickProviderOpen}
        setQuickProviderOpen={setQuickProviderOpen}
        quickProviderCode={quickProviderCode}
        setQuickProviderCode={setQuickProviderCode}
        quickProviderName={quickProviderName}
        setQuickProviderName={setQuickProviderName}
        createProviderMutation={createProviderMutation}
        groupPickOpen={groupPickOpen}
        setGroupPickOpen={setGroupPickOpen}
        quickGroupOpen={quickGroupOpen}
        setQuickGroupOpen={setQuickGroupOpen}
        quickGroupDraft={quickGroupDraft}
        setQuickGroupDraft={setQuickGroupDraft}
        brandPickOpen={brandPickOpen}
        setBrandPickOpen={setBrandPickOpen}
        quickBrandOpen={quickBrandOpen}
        setQuickBrandOpen={setQuickBrandOpen}
        quickBrandDraft={quickBrandDraft}
        setQuickBrandDraft={setQuickBrandDraft}
        setValues={setValues}
        onApplyQuickCategory={applyQuickCategory}
        isApplyingQuickCategory={createCategoryMutation.isPending}
      />
    </>
  );
}

/** Split a comma-separated attribute field into trimmed, non-empty values. */
function splitAttributeValues(raw: string): string[] {
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/** Stable key for a (color, size) combo, used to merge edits across regenerations. */
function variantComboKey(color: string, size: string): string {
  return `${color}__${size}`;
}

/** Uppercase, accent-stripped slug for SKU suffixes. */
function variantSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, (c) => (c === "đ" ? "d" : "D"))
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

/** Auto SKU = base SKU + accent-stripped color/size suffixes (e.g. "AO-DO-S"). */
function autoVariantSku(base: string, color: string, size: string): string {
  return [base, variantSlug(color), variantSlug(size)].filter(Boolean).join("-");
}
