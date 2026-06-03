import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  FormField,
  Input,
  MoneyInput,
  TagsInput,
  Textarea,
} from "@erp/ui";
import { ImagePlus, Plus, Trash2, X } from "lucide-react";
import { CrudFieldInput } from "../CrudFieldInput";
import { LookupField } from "../../forms/LookupField";

import {
  COMMISSION_METHOD_OPTIONS,
  COMMISSION_POSITION_OPTIONS,
  DEFAULT_EXTRAS,
  IMAGE_ACCEPT,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_COUNT,
  SUB_TABS,
  SubTab,
  Tab,
  TABS,
} from "./item-create/constants";
import {
  ConversionUnitsTable,
  createBlankConversionUnitRow,
  type ConversionUnitRow,
} from "./item-create/ConversionUnitsTable";
import {
  ItemProvidersTable,
  type ItemProviderRow,
} from "./item-create/ItemProvidersTable";
import {
  ProductVariantsTable,
  VARIANT_DEFAULT_UNIT,
  type ProductVariantRow,
} from "./item-create/ProductVariantsTable";
import { InventoryItemActionBar } from "./item-create/InventoryItemActionBar";
import { Tabs } from "../../tabs/Tabs";
import {
  useBrands,
  useItemCategories,
  useItemUnits,
} from "./item-create/hooks";
import {
  BrandCreateDialog,
  type BrandPick,
} from "./item-create/dialogs/BrandCreateDialog";
import { BrandListDialog } from "./item-create/dialogs/BrandListDialog";
import {
  ItemCategoryCreateDialog,
  type CategoryPick,
} from "./item-create/dialogs/ItemCategoryCreateDialog";
import {
  UnitCreateDialog,
  type UnitPick,
} from "./item-create/dialogs/UnitCreateDialog";
import type {
  CommissionRow,
  FormExtras,
  InventoryItemCreateFormProps as Props,
} from "./item-create/types";

interface Option {
  id: string;
  name: string;
}

const toNumberOrUndef = (raw: string): number | undefined => {
  if (raw === "" || raw === null || raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
};

const numToStr = (v: unknown): string =>
  v === null || v === undefined || v === "" ? "" : String(v);

export function InventoryItemCreateForm({
  editableFields,
  values,
  setValues,
  errors,
  setErrors,
  entityKey,
  isSaving = false,
  mode = "create",
  initialRecord,
}: Props) {
  const navigate = useNavigate();
  const isEdit = mode === "edit";

  const [activeTab, setActiveTab] = useState<Tab>(Tab.BASIC);
  const [extras, setExtras] = useState<FormExtras>(DEFAULT_EXTRAS);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>(SubTab.CONVERSION);

  const [categoryCreateOpen, setCategoryCreateOpen] = useState(false);
  const [brandCreateOpen, setBrandCreateOpen] = useState(false);
  const [brandListOpen, setBrandListOpen] = useState(false);
  const [unitCreateOpen, setUnitCreateOpen] = useState(false);

  // Locally-created master rows, merged into the select options so a just-created
  // value is selectable immediately (before the list query refetches).
  const [addedCategories, setAddedCategories] = useState<Option[]>([]);
  const [addedBrands, setAddedBrands] = useState<Option[]>([]);
  const [addedUnits, setAddedUnits] = useState<string[]>([]);

  const [barcodeInput, setBarcodeInput] = useState("");

  const [productImages, setProductImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const previewsRef = useRef<string[]>([]);

  const [unitRows, setUnitRows] = useState<ConversionUnitRow[]>([
    createBlankConversionUnitRow(),
  ]);
  const [providerRows, setProviderRows] = useState<ItemProviderRow[]>([]);

  const [variantRows, setVariantRows] = useState<ProductVariantRow[]>([]);
  const removedVariantKeys = useRef<Set<string>>(new Set());

  const editableFieldsByKey = useMemo(
    () => new Map(editableFields.map((f) => [f.key, f])),
    [editableFields],
  );

  // ─── Master-data option lists (Nhóm hàng hóa / Thương hiệu / Đơn vị tính) ──
  const categoriesQuery = useItemCategories("", true);
  const brandsQuery = useBrands("", true);
  const unitsQuery = useItemUnits("", true);

  const categoryOptions = useMemo<Option[]>(() => {
    const data = (categoriesQuery.data?.data ?? []) as Record<
      string,
      unknown
    >[];
    const base = data.map((r) => ({
      id: String(r.id ?? ""),
      name: String(r.name ?? ""),
    }));
    const seen = new Set(base.map((o) => o.id));
    return [...base, ...addedCategories.filter((o) => !seen.has(o.id))];
  }, [categoriesQuery.data, addedCategories]);

  const brandOptions = useMemo<Option[]>(() => {
    const data = (brandsQuery.data?.data ?? []) as Record<string, unknown>[];
    const base = data.map((r) => ({
      id: String(r.id ?? ""),
      name: String(r.name ?? ""),
    }));
    const seen = new Set(base.map((o) => o.id));
    return [...base, ...addedBrands.filter((o) => !seen.has(o.id))];
  }, [brandsQuery.data, addedBrands]);

  const unitOptions = useMemo<string[]>(() => {
    const data = (unitsQuery.data?.data ?? []) as Record<string, unknown>[];
    const base = data.map((r) => String(r.name ?? "")).filter(Boolean);
    const merged = new Set([...base, ...addedUnits]);
    const current = String(values.unit ?? "");
    if (current) merged.add(current);
    return [...merged];
  }, [unitsQuery.data, addedUnits, values.unit]);

  // Saved per-variant rows (edit mode), keyed by "color__size", to hydrate the
  // variant table with persisted prices / SKU / barcode.
  const savedVariantsByKey = useMemo(() => {
    const m = new Map<string, Record<string, unknown>>();
    if (isEdit && initialRecord && Array.isArray(initialRecord.variants)) {
      for (const v of initialRecord.variants as Record<string, unknown>[]) {
        m.set(`${String(v.color ?? "")}__${String(v.size ?? "")}`, v);
      }
    }
    return m;
  }, [isEdit, initialRecord]);

  // ─── Hydrate extras / conversion units / providers in edit mode (once) ─────
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!isEdit || hydratedRef.current || !initialRecord) return;
    hydratedRef.current = true;
    const rec = initialRecord;
    setExtras((prev) => ({
      ...prev,
      initialStock: numToStr(rec.initialStock) || "0",
      initialStockUnitPrice: numToStr(rec.initialStockUnitPrice) || "0",
      showOnPos: rec.isPosVisible !== false,
      manageBarcodePerUnit: Boolean(rec.manageBarcodePerUnit),
      isGoldSilver: Boolean(rec.isGoldSilver),
      oddSize: numToStr(rec.oddSize),
      weightG: numToStr(rec.packageWeightGram),
      pkgLength: numToStr(rec.packageLengthCm),
      pkgWidth: numToStr(rec.packageWidthCm),
      pkgHeight: numToStr(rec.packageHeightCm),
    }));
    if (Array.isArray(rec.units)) {
      const rows = (rec.units as Record<string, unknown>[]).map((u, i) => ({
        id: `unit-${i}-${String(u.id ?? i)}`,
        unitName: String(u.unitName ?? ""),
        ratio: numToStr(u.ratio) || "1",
        description: String(u.description ?? ""),
        buyPrice: numToStr(u.purchasePrice) || "0",
        sellPrice: numToStr(u.sellPrice) || "0",
        defaultSell: Boolean(u.isDefaultSell),
        defaultBuy: Boolean(u.isDefaultBuy),
      }));
      if (rows.length) setUnitRows(rows);
    }
    if (Array.isArray(rec.providers)) {
      const rows = (rec.providers as Record<string, unknown>[]).map((p, i) => {
        const prov = (p.provider ?? {}) as Record<string, unknown>;
        return {
          rowId: `prov-${i}-${String(p.id ?? i)}`,
          providerId: String(p.providerId ?? prov.id ?? ""),
          code: String(prov.code ?? ""),
          name: String(prov.name ?? ""),
          address: String(prov.address ?? ""),
          isPrimary: Boolean(p.isPrimary),
        };
      });
      if (rows.length) setProviderRows(rows);
    }
  }, [isEdit, initialRecord]);

  // ─── Sync local state into the parent `values` payload (DTO keys) ──────────
  useEffect(() => {
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

    const trimmedBarcode = barcodeInput.trim();

    setValues((prev) => ({
      ...prev,
      isPosVisible: extras.showOnPos,
      manageBarcodePerUnit: extras.manageBarcodePerUnit,
      isGoldSilver: extras.isGoldSilver,
      oddSize: extras.oddSize || undefined,
      packageWeightGram: toNumberOrUndef(extras.weightG),
      packageLengthCm: toNumberOrUndef(extras.pkgLength),
      packageWidthCm: toNumberOrUndef(extras.pkgWidth),
      packageHeightCm: toNumberOrUndef(extras.pkgHeight),
      units: units.length > 0 ? units : isEdit ? [] : undefined,
      barcodes: trimmedBarcode ? [{ code: trimmedBarcode }] : undefined,
      threshold,
      initialStock: isEdit ? undefined : toNumberOrUndef(extras.initialStock),
      initialStockUnitPrice: isEdit
        ? undefined
        : toNumberOrUndef(extras.initialStockUnitPrice),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extras, unitRows, barcodeInput]);

  // ─── Sync the multi-provider table into `providers[]` ──────────────────────
  useEffect(() => {
    const providers = providerRows
      .filter((r) => r.providerId)
      .map((r) => ({ providerId: r.providerId, isPrimary: r.isPrimary }));
    setValues((prev) => ({ ...prev, providers }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerRows]);

  // ─── Auto-generate variant rows from the "Thông tin thuộc tính" inputs ─────
  useEffect(() => {
    const toList = (v: unknown): string[] =>
      Array.isArray(v)
        ? (v as string[]).map((s) => s.trim()).filter(Boolean)
        : [];
    const colors = toList(values.colors);
    const sizes = toList(values.sizes);

    const combos: Array<{ color: string; size: string }> = [];
    if (colors.length && sizes.length) {
      for (const color of colors)
        for (const size of sizes) combos.push({ color, size });
    } else if (colors.length) {
      for (const color of colors) combos.push({ color, size: "" });
    } else if (sizes.length) {
      for (const size of sizes) combos.push({ color: "", size });
    }

    const baseSku = String(values.code ?? "");
    const baseName = String(values.name ?? "").trim();
    const categoryName = String(values.categoryName ?? "").trim();
    const baseUnit = String(values.unit ?? "").trim() || VARIANT_DEFAULT_UNIT;

    setVariantRows((prev) => {
      const byKey = new Map(
        prev.map((r) => [variantComboKey(r.color, r.size), r]),
      );
      const next: ProductVariantRow[] = [];
      for (const { color, size } of combos) {
        const key = variantComboKey(color, size);
        if (removedVariantKeys.current.has(key)) continue;
        // Name, unit and SKU always track the product (name/unit/code) — they
        // re-derive on every change rather than being kept per-row.
        const label = [color, size].filter(Boolean).join("/");
        const fullName = [categoryName, baseName].filter(Boolean).join(" ");
        const variantName = fullName ? `${fullName} (${label})` : `(${label})`;
        const sku = autoVariantSku(baseSku, color, size);
        const existing = byKey.get(key);
        if (existing) {
          // Mã vạch defaults to (clones) the SKU; keep it if the user customized it.
          const keepBarcode =
            existing.barcode && existing.barcode !== existing.sku
              ? existing.barcode
              : sku;
          next.push({
            ...existing,
            name: variantName,
            unit: baseUnit,
            sku,
            barcode: keepBarcode,
          });
        } else {
          // Edit mode: seed the row from the saved variant (price/SKU/barcode).
          const saved = savedVariantsByKey.get(key);
          const savedSku =
            saved && typeof saved.code === "string" && saved.code
              ? String(saved.code)
              : sku;
          next.push({
            id: `variant-${key}`,
            itemId:
              saved && typeof saved.id === "string" ? String(saved.id) : undefined,
            color,
            size,
            name: variantName,
            unit: baseUnit,
            sku: savedSku,
            barcode: saved && saved.barcode ? String(saved.barcode) : savedSku,
            purchasePrice:
              saved && saved.purchasePrice != null
                ? String(saved.purchasePrice)
                : "0",
            sellPrice:
              saved && saved.sellPrice != null ? String(saved.sellPrice) : "0",
            initialStock: "0",
          });
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    values.colors,
    values.sizes,
    values.code,
    values.unit,
    values.name,
    values.categoryName,
    savedVariantsByKey,
  ]);

  useEffect(() => {
    setValues((prev) => ({
      ...prev,
      variants:
        variantRows.length > 0
          ? variantRows.map((r) => ({
              itemId: r.itemId,
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

  const copyPriceDown = (row: ProductVariantRow) => {
    setVariantRows((prev) => {
      const idx = prev.findIndex((r) => r.id === row.id);
      if (idx < 0) return prev;
      const { purchasePrice, sellPrice } = prev[idx];
      return prev.map((r, i) =>
        i > idx ? { ...r, purchasePrice, sellPrice } : r,
      );
    });
  };

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);
  useEffect(() => {
    return () => {
      previewsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const updateExtras = <K extends keyof FormExtras>(
    key: K,
    value: FormExtras[K],
  ) => {
    setExtras((prev) => ({ ...prev, [key]: value }));
  };

  // ─── Master-data selection handlers ────────────────────────────────────────
  const onCategoryCreated = (cat: CategoryPick) => {
    setAddedCategories((prev) => [...prev, { id: cat.id, name: cat.name }]);
    setValues((prev) => ({
      ...prev,
      categoryId: cat.id,
      categoryName: cat.name,
    }));
  };

  const onBrandResolved = (brand: BrandPick) => {
    setAddedBrands((prev) => [...prev, { id: brand.id, name: brand.name }]);
    setValues((prev) => ({ ...prev, brandId: brand.id, brand: brand.name }));
  };

  const selectUnit = (name: string) => {
    setValues((prev) => ({ ...prev, unit: name }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.unit;
      return next;
    });
  };
  const onUnitCreated = (unit: UnitPick) => {
    setAddedUnits((prev) => [...prev, unit.name]);
    selectUnit(unit.name);
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
      if (newPreviewUrls.length) setPreviews((p) => [...p, ...newPreviewUrls]);
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
      commissions: prev.commissions.map((c) =>
        c.id === id ? { ...c, ...patch } : c,
      ),
    }));
  };

  const renderedDynamicKeys = useRef(new Set<string>());

  const renderDynamicField = (key: string) => {
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
        layout="horizontal"
        labelWidth="10rem"
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

  const renderRemainingFields = () => {
    const skip = renderedDynamicKeys.current;
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
      "manufactureYear",
      "composition",
      "weightGram",
      "lengthCm",
      "widthCm",
      "heightCm",
      "providerId",
      "categoryId",
      "categoryName",
      "brand",
      "brandId",
      "itemType",
      "unit",
      "productId",
      "productName",
      "variantLabel",
      "colors",
      "sizes",
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

  renderedDynamicKeys.current = new Set();

  const selectClass =
    "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

  const basicTab = (
    <>
      <section className="rounded-md border border-border bg-background p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Thông tin
        </h3>
        <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            {renderDynamicField("name")}

            {/* Nhóm hàng hóa — searchable categoryId picker + quick-create */}
            <FormField
              label="Nhóm hàng hóa"
              htmlFor="create-category"
              layout="horizontal"
              labelWidth="10rem"
            >
              <LookupField<Option>
                inputId="create-category"
                placeholder="Nhập để tìm kiếm"
                value={String(values.categoryName ?? "")}
                onValueChange={(text) =>
                  setValues((prev) => ({
                    ...prev,
                    categoryName: text,
                    categoryId: "",
                  }))
                }
                onSelect={(opt) => {
                  setValues((prev) => ({
                    ...prev,
                    categoryId: opt.id,
                    categoryName: opt.name,
                  }));
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.categoryId;
                    return next;
                  });
                }}
                search={(q) =>
                  Promise.resolve(
                    categoryOptions.filter((o) =>
                      o.name.toLowerCase().includes(q.trim().toLowerCase()),
                    ),
                  )
                }
                itemKey={(o) => o.id}
                renderItem={(o) => o.name}
                onCreateNew={() => setCategoryCreateOpen(true)}
              />
            </FormField>

            {/* Thương hiệu — searchable brandId picker; search icon = list, + = create */}
            <FormField
              label="Thương hiệu"
              htmlFor="create-brand"
              layout="horizontal"
              labelWidth="10rem"
            >
              <LookupField<Option>
                inputId="create-brand"
                placeholder="Chọn thương hiệu"
                value={String(values.brand ?? "")}
                onValueChange={(text) =>
                  setValues((prev) => ({ ...prev, brand: text, brandId: "" }))
                }
                onSelect={(opt) =>
                  setValues((prev) => ({
                    ...prev,
                    brandId: opt.id,
                    brand: opt.name,
                  }))
                }
                search={(q) =>
                  Promise.resolve(
                    brandOptions.filter((o) =>
                      o.name.toLowerCase().includes(q.trim().toLowerCase()),
                    ),
                  )
                }
                itemKey={(o) => o.id}
                renderItem={(o) => o.name}
                onSearchButtonClick={() => setBrandListOpen(true)}
                onCreateNew={() => setBrandCreateOpen(true)}
              />
            </FormField>

            {renderDynamicField("code")}

            <FormField
              label="Mã vạch"
              htmlFor="create-barcode"
              layout="horizontal"
              labelWidth="10rem"
            >
              <Input
                id="create-barcode"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder="Hệ thống tự sinh khi bỏ trống"
              />
            </FormField>

            {renderDynamicField("purchasePrice")}
            {renderDynamicField("sellingPrice")}

            {/* Đơn vị tính cơ bản — searchable unit picker + quick-create */}
            <FormField
              label="Đơn vị tính cơ bản"
              htmlFor="create-unit"
              required
              error={errors.unit}
              layout="horizontal"
              labelWidth="10rem"
            >
              <LookupField<string>
                inputId="create-unit"
                placeholder="Chọn đơn vị tính"
                value={String(values.unit ?? "")}
                onValueChange={(text) => selectUnit(text)}
                onSelect={(u) => selectUnit(u)}
                search={(q) =>
                  Promise.resolve(
                    unitOptions.filter((u) =>
                      u.toLowerCase().includes(q.trim().toLowerCase()),
                    ),
                  )
                }
                itemKey={(u) => u}
                renderItem={(u) => u}
                onCreateNew={() => setUnitCreateOpen(true)}
              />
              <p className="mt-1 text-xs italic text-muted-foreground">
                (Nên để đơn vị tính nhỏ nhất. VD: Vải bán theo Cuộn và Mét thì
                để ĐVT là Mét.)
              </p>
            </FormField>
          </div>

          <div className="flex flex-col gap-3">
            <FormField
              label="Tồn kho ban đầu"
              htmlFor="extra-initial-stock"
              layout="horizontal"
              labelWidth="10rem"
            >
              <Input
                id="extra-initial-stock"
                type="number"
                value={extras.initialStock}
                onChange={(e) => updateExtras("initialStock", e.target.value)}
                inputMode="decimal"
                disabled={isEdit}
              />
              {isEdit ? (
                <p className="mt-1 text-xs italic text-muted-foreground">
                  (Tồn kho ban đầu chỉ được nhập khi thêm mới hàng hóa.)
                </p>
              ) : null}
            </FormField>
            <FormField
              label="Đơn giá nhập đầu kỳ"
              htmlFor="extra-initial-stock-price"
              layout="horizontal"
              labelWidth="10rem"
            >
              <MoneyInput
                id="extra-initial-stock-price"
                value={
                  extras.initialStockUnitPrice === "" ||
                  extras.initialStockUnitPrice == null
                    ? ""
                    : Number(extras.initialStockUnitPrice)
                }
                onChange={(v) =>
                  updateExtras(
                    "initialStockUnitPrice",
                    v === "" ? "" : String(v),
                  )
                }
                disabled={isEdit}
              />
            </FormField>

            {editableFieldsByKey.has("isActive") && (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(values.isActive)}
                  onChange={(event) =>
                    setValues((prev) => ({
                      ...prev,
                      isActive: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border border-input accent-primary"
                />
                Đang hoạt động
              </label>
            )}
          </div>
        </div>

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
      <section className="rounded-md border">
        <Tabs
          tabs={SUB_TABS}
          activeTab={activeSubTab}
          onTabChange={setActiveSubTab}
        />
        <div className="p-3">
          {activeSubTab === SubTab.CONVERSION ? (
            <ConversionUnitsTable rows={unitRows} setRows={setUnitRows} />
          ) : (
            <ItemProvidersTable rows={providerRows} setRows={setProviderRows} />
          )}
        </div>
      </section>

      {/* Ảnh hàng hóa + checkbox hiển thị POS */}
      <section className="rounded-md border border-border bg-background p-4">
        <h3 className="mb-1 text-sm font-semibold">Ảnh hàng hóa</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Định dạng .jpg, .jpeg, .png, .gif, .webp — tối đa 2MB mỗi ảnh, tối đa{" "}
          {MAX_IMAGE_COUNT} ảnh. Ảnh chỉ lưu trên trình duyệt cho đến khi máy
          chủ hỗ trợ tải lên.
        </p>
        {imageError ? (
          <p className="mb-2 text-sm text-destructive">{imageError}</p>
        ) : null}
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
          <FormField label="Màu sắc" layout="horizontal" labelWidth="7rem">
            <TagsInput
              value={
                Array.isArray(values.colors) ? (values.colors as string[]) : []
              }
              onValueChange={(tags) =>
                setValues((prev) => ({ ...prev, colors: tags }))
              }
              placeholder="Nhập màu rồi Enter (VD: Đen, Trắng…)"
            />
          </FormField>
          <FormField label="Size" layout="horizontal" labelWidth="7rem">
            <TagsInput
              value={
                Array.isArray(values.sizes) ? (values.sizes as string[]) : []
              }
              onValueChange={(tags) =>
                setValues((prev) => ({ ...prev, sizes: tags }))
              }
              placeholder="Nhập size rồi Enter (VD: 38, 39, 40…)"
            />
          </FormField>
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={extras.manageBarcodePerUnit}
            onChange={(e) =>
              updateExtras("manageBarcodePerUnit", e.target.checked)
            }
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

  const numberFieldHandler =
    (key: string) => (e: { target: { value: string } }) => {
      const raw = e.target.value;
      setValues((prev) => ({ ...prev, [key]: raw === "" ? "" : Number(raw) }));
    };

  const additionalTab = (
    <section className="rounded-md border border-border bg-background p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid gap-3 md:col-span-2 md:grid-cols-4">
          <FormField
            label="Trọng lượng (g)"
            htmlFor="extra-net-weight"
            layout="horizontal"
            labelWidth="7rem"
          >
            <Input
              id="extra-net-weight"
              type="number"
              inputMode="decimal"
              value={String(values.weightGram ?? "")}
              onChange={numberFieldHandler("weightGram")}
            />
          </FormField>
          <FormField
            label="Dài (cm)"
            htmlFor="extra-net-length"
            layout="horizontal"
            labelWidth="5rem"
          >
            <Input
              id="extra-net-length"
              type="number"
              inputMode="decimal"
              value={String(values.lengthCm ?? "")}
              onChange={numberFieldHandler("lengthCm")}
            />
          </FormField>
          <FormField
            label="Rộng (cm)"
            htmlFor="extra-net-width"
            layout="horizontal"
            labelWidth="5rem"
          >
            <Input
              id="extra-net-width"
              type="number"
              inputMode="decimal"
              value={String(values.widthCm ?? "")}
              onChange={numberFieldHandler("widthCm")}
            />
          </FormField>
          <FormField
            label="Cao (cm)"
            htmlFor="extra-net-height"
            layout="horizontal"
            labelWidth="5rem"
          >
            <Input
              id="extra-net-height"
              type="number"
              inputMode="decimal"
              value={String(values.heightCm ?? "")}
              onChange={numberFieldHandler("heightCm")}
            />
          </FormField>
        </div>

        <FormField
          label="Trọng lượng gói hàng (g)"
          htmlFor="extra-weight"
          layout="horizontal"
          labelWidth="11rem"
        >
          <Input
            id="extra-weight"
            type="number"
            inputMode="decimal"
            value={extras.weightG}
            onChange={(e) => updateExtras("weightG", e.target.value)}
          />
        </FormField>

        <FormField
          label="Kích thước đóng gói (cm)"
          layout="horizontal"
          labelWidth="11rem"
        >
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

        <FormField
          label="Đầy size"
          htmlFor="extra-odd-size"
          layout="horizontal"
          labelWidth="11rem"
        >
          <Input
            id="extra-odd-size"
            value={extras.oddSize}
            onChange={(e) => updateExtras("oddSize", e.target.value)}
          />
        </FormField>

        <FormField
          label="Năm sản xuất"
          htmlFor="extra-year-made"
          layout="horizontal"
          labelWidth="11rem"
        >
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

        <FormField
          label="Thành phần"
          htmlFor="extra-composition"
          className="md:col-span-2"
          layout="horizontal"
          labelWidth="11rem"
        >
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

        <FormField
          label="Mô tả"
          htmlFor="extra-long-desc"
          className="md:col-span-2"
          layout="horizontal"
          labelWidth="11rem"
        >
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
      <div className="grid gap-3 md:max-w-xl md:grid-cols-2">
        <FormField
          label="Tối thiểu"
          htmlFor="extra-min-stock"
          layout="horizontal"
          labelWidth="7rem"
          className="col-span-2"
        >
          <Input
            id="extra-min-stock"
            type="number"
            inputMode="decimal"
            value={extras.minStock}
            onChange={(e) => updateExtras("minStock", e.target.value)}
          />
        </FormField>
        <FormField
          label="Tối đa"
          htmlFor="extra-max-stock"
          layout="horizontal"
          labelWidth="7rem"
          className="col-span-2"
        >
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
                    className={selectClass}
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
                    className={selectClass}
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
                      updateCommissionRow(row.id, {
                        discountLimit: e.target.value,
                      })
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
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-sm text-muted-foreground"
                >
                  Chưa có cấu hình hoa hồng.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addCommissionRow}
        >
          <Plus className="mr-1 h-4 w-4" /> Thêm dòng
        </Button>
      </div>
    </section>
  );

  return (
    <>
      <Tabs
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        className="mb-4"
      />

      <div className="flex flex-col gap-4 pb-28">
        {activeTab === Tab.BASIC && basicTab}
        {activeTab === Tab.ADDITIONAL && additionalTab}
        {activeTab === Tab.WAREHOUSE && warehouseTab}
        {activeTab === Tab.COMMISSION && commissionTab}
      </div>

      <InventoryItemActionBar
        isSaving={isSaving}
        onCancel={() => navigate(`/admin/${entityKey}`)}
      />

      <ItemCategoryCreateDialog
        open={categoryCreateOpen}
        onOpenChange={setCategoryCreateOpen}
        onCreated={onCategoryCreated}
      />
      <BrandCreateDialog
        open={brandCreateOpen}
        onOpenChange={setBrandCreateOpen}
        initialName={String(values.brand ?? "")}
        onCreated={onBrandResolved}
      />
      <BrandListDialog
        open={brandListOpen}
        onOpenChange={setBrandListOpen}
        onPick={onBrandResolved}
      />
      <UnitCreateDialog
        open={unitCreateOpen}
        onOpenChange={setUnitCreateOpen}
        initialName={String(values.unit ?? "")}
        onCreated={onUnitCreated}
      />
    </>
  );
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
  return [base, variantSlug(color), variantSlug(size)]
    .filter(Boolean)
    .join("-");
}
