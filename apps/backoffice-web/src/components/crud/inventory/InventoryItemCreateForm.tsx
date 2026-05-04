import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { FieldDefinition } from "@erp/shared-interfaces";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FormField,
  Input,
} from "@erp/ui";
import { ChevronDown, ImagePlus, Plus, Search, X } from "lucide-react";
import { CrudFieldInput } from "../CrudFieldInput";
import { useCrudCreate, useCrudRecords } from "../useCrudApi";

const UNIT_PRESETS = ["Cái", "Hộp", "Thùng", "Chai", "Kg", "Lốc", "Tờ", "Bộ"];
const GROUP_SUGGESTIONS = ["Điện tử", "Văn phòng phẩm", "Thực phẩm", "Gia dụng", "Thời trang"];
const BRAND_SUGGESTIONS = ["Samsung", "LG", "Sony", "Deli", "Stabilo", "3M"];

const MAX_IMAGE_COUNT = 10;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_ACCEPT = "image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp";

interface Props {
  editableFields: FieldDefinition[];
  values: Record<string, unknown>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  errors: Record<string, string>;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  inventoryExtras: Record<string, string>;
  setInventoryExtras: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export function InventoryItemCreateForm({
  editableFields,
  values,
  setValues,
  errors,
  setErrors,
  inventoryExtras,
  setInventoryExtras,
}: Props) {
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

  const { data: categoryFetch } = useCrudRecords(
    "inventory-items",
    { page: 1, pageSize: 300, sortBy: undefined, sortOrder: "desc", search: "", filters: {} },
    categoryPickOpen,
  );

  const categoryOptions = useMemo(() => {
    const raw = categoryFetch?.data ?? [];
    const set = new Set<string>();
    for (const row of raw) {
      const c = row.category;
      if (typeof c === "string" && c.trim()) set.add(c.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b, "vi"));
  }, [categoryFetch?.data]);

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

  const handlePickCategory = (label: string) => {
    setValues((prev) => ({ ...prev, category: label }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.category;
      return next;
    });
    setCategoryPickOpen(false);
  };

  const handlePickProvider = (row: Record<string, unknown>) => {
    const id = String(row.id ?? "");
    const name = String(row.name ?? "");
    const code = String(row.code ?? "");
    setValues((prev) => ({
      ...prev,
      providerId: id,
      providerName: name,
      providerCode: code,
    }));
    setProviderSummary({ name, code });
    setErrors((prev) => {
      const next = { ...prev };
      delete next.providerId;
      return next;
    });
    setProviderPickOpen(false);
  };

  const clearProvider = () => {
    setValues((prev) => ({
      ...prev,
      providerId: "",
      providerName: "",
      providerCode: "",
    }));
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
          setQuickGroupDraft(inventoryExtras.itemType);
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
          setQuickBrandDraft(inventoryExtras.brand);
          setQuickBrandOpen(true);
        }}
      >
        <Plus className="h-4 w-4" />
      </button>
    </>
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 border-b pb-3 text-xs">
        <button type="button" className="rounded bg-primary px-3 py-1.5 text-primary-foreground">
          Thông tin cơ bản
        </button>
        <button
          type="button"
          className="rounded border border-border px-3 py-1.5 text-muted-foreground"
          disabled
        >
          Thông tin bổ sung
        </button>
        <button
          type="button"
          className="rounded border border-border px-3 py-1.5 text-muted-foreground"
          disabled
        >
          Thông tin kho
        </button>
        <button
          type="button"
          className="rounded border border-border px-3 py-1.5 text-muted-foreground"
          disabled
        >
          Hoa hồng
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {editableFields.map((field) => {
          if (field.key === "providerId") {
            return (
              <FormField
                key={field.key}
                label={field.label}
                htmlFor="create-provider-id"
                error={errors.providerId}
                required={field.required}
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
                      placeholder="Chọn nhà cung cấp (tìm trong danh sách)…"
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
            );
          }

          let trailing: ReactNode;
          if (field.key === "category") trailing = trailingCategory;
          else if (field.key === "unit") trailing = trailingUnit;

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
        })}

        <div className="md:col-span-2">
          <FormField label="Nhóm hàng hóa" htmlFor="extra-item-type">
            <div className="flex items-start gap-1.5">
              <div className="min-w-0 flex-1">
                <Input
                  id="extra-item-type"
                  type="text"
                  value={inventoryExtras.itemType}
                  onChange={(event) =>
                    setInventoryExtras((prev) => ({ ...prev, itemType: event.target.value }))
                  }
                  placeholder="VD: Điện tử, Gia dụng…"
                />
              </div>
              {trailingGroup}
            </div>
          </FormField>
        </div>
        <div className="md:col-span-2">
          <FormField label="Thương hiệu" htmlFor="extra-brand">
            <div className="flex items-start gap-1.5">
              <div className="min-w-0 flex-1">
                <Input
                  id="extra-brand"
                  type="text"
                  value={inventoryExtras.brand}
                  onChange={(event) =>
                    setInventoryExtras((prev) => ({ ...prev, brand: event.target.value }))
                  }
                  placeholder="VD: Samsung, Deli…"
                />
              </div>
              {trailingBrand}
            </div>
          </FormField>
        </div>
        <FormField label="Mã vạch" htmlFor="extra-barcode">
          <Input
            id="extra-barcode"
            type="text"
            value={inventoryExtras.barcode}
            onChange={(event) =>
              setInventoryExtras((prev) => ({ ...prev, barcode: event.target.value }))
            }
            placeholder="Để trống để hệ thống tự sinh (nếu có)"
          />
        </FormField>
        <FormField label="Mô tả" htmlFor="extra-description" className="md:col-span-2">
          <textarea
            id="extra-description"
            rows={3}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={inventoryExtras.description}
            onChange={(event) =>
              setInventoryExtras((prev) => ({ ...prev, description: event.target.value }))
            }
            placeholder="Mô tả ngắn gọn…"
          />
        </FormField>
      </div>

      <div className="mt-5 border-t pt-4">
        <h2 className="mb-2 text-sm font-semibold">Đơn vị chuyển đổi</h2>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-2 py-2 text-left">Tên đơn vị tính</th>
                <th className="px-2 py-2 text-left">Tỷ lệ quy đổi</th>
                <th className="px-2 py-2 text-left">Giá mua</th>
                <th className="px-2 py-2 text-left">Giá bán</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-2 py-2">
                  <Input
                    value={inventoryExtras.unitConversionName}
                    onChange={(event) =>
                      setInventoryExtras((prev) => ({
                        ...prev,
                        unitConversionName: event.target.value,
                      }))
                    }
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    type="number"
                    value={inventoryExtras.conversionRate}
                    onChange={(event) =>
                      setInventoryExtras((prev) => ({
                        ...prev,
                        conversionRate: event.target.value,
                      }))
                    }
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    type="number"
                    value={inventoryExtras.purchasePriceByUnit}
                    onChange={(event) =>
                      setInventoryExtras((prev) => ({
                        ...prev,
                        purchasePriceByUnit: event.target.value,
                      }))
                    }
                  />
                </td>
                <td className="px-2 py-2">
                  <Input
                    type="number"
                    value={inventoryExtras.sellPriceByUnit}
                    onChange={(event) =>
                      setInventoryExtras((prev) => ({
                        ...prev,
                        sellPriceByUnit: event.target.value,
                      }))
                    }
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 border-t pt-4">
        <h2 className="mb-1 text-sm font-semibold">Ảnh hàng hóa</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Định dạng .jpg, .jpeg, .png, .gif, .webp — dung lượng tối đa 2MB mỗi ảnh, tối đa{" "}
          {MAX_IMAGE_COUNT} ảnh. Ảnh chỉ lưu trên trình duyệt cho đến khi máy chủ hỗ trợ tải lên.
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
      </div>

      {/* Dialog: chọn danh mục */}
      <Dialog open={categoryPickOpen} onOpenChange={setCategoryPickOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chọn danh mục</DialogTitle>
            <DialogDescription>
              Danh sách lấy từ các mặt hàng hiện có. Chọn một dòng để điền vào biểu mẫu.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
            {categoryOptions.length === 0 ? (
              <li className="text-sm text-muted-foreground">Chưa có danh mục nào trong hệ thống.</li>
            ) : (
              categoryOptions.map((c) => (
                <li key={c}>
                  <button
                    type="button"
                    className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={() => handlePickCategory(c)}
                  >
                    {c}
                  </button>
                </li>
              ))
            )}
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCategoryPickOpen(false)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={quickCategoryOpen} onOpenChange={setQuickCategoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm nhanh danh mục</DialogTitle>
            <DialogDescription>Nhập tên danh mục và lưu vào ô Danh mục trên biểu mẫu.</DialogDescription>
          </DialogHeader>
          <Input
            value={quickCategoryDraft}
            onChange={(e) => setQuickCategoryDraft(e.target.value)}
            placeholder="Tên danh mục"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setQuickCategoryOpen(false)}>
              Huỷ
            </Button>
            <Button
              type="button"
              onClick={() => {
                handlePickCategory(quickCategoryDraft.trim());
                setQuickCategoryOpen(false);
              }}
            >
              Áp dụng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: chọn NCC */}
      <Dialog open={providerPickOpen} onOpenChange={setProviderPickOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Tìm nhà cung cấp</DialogTitle>
            <DialogDescription>Tìm theo mã, tên hoặc email — chọn một NCC để gán.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Tìm kiếm…"
            value={providerSearch}
            onChange={(e) => setProviderSearch(e.target.value)}
            className="mb-2"
          />
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
            {providersLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium">Mã</th>
                    <th className="px-2 py-2 text-left font-medium">Tên</th>
                  </tr>
                </thead>
                <tbody>
                  {(providerFetch?.data ?? []).map((row) => (
                    <tr
                      key={String(row.id)}
                      className="cursor-pointer border-t border-border hover:bg-accent/50"
                      onClick={() => handlePickProvider(row)}
                    >
                      <td className="px-2 py-2">{String(row.code ?? "")}</td>
                      <td className="px-2 py-2">{String(row.name ?? "")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setProviderPickOpen(false)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={quickProviderOpen} onOpenChange={setQuickProviderOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm nhà cung cấp mới</DialogTitle>
            <DialogDescription>
              Tạo NCC trong danh mục &quot;Nhà cung cấp&quot;, sau đó tự gán cho mặt hàng này.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <FormField label="Mã NCC" htmlFor="qp-code">
              <Input
                id="qp-code"
                value={quickProviderCode}
                onChange={(e) => setQuickProviderCode(e.target.value)}
                required
              />
            </FormField>
            <FormField label="Tên NCC" htmlFor="qp-name">
              <Input
                id="qp-name"
                value={quickProviderName}
                onChange={(e) => setQuickProviderName(e.target.value)}
                required
              />
            </FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setQuickProviderOpen(false)}>
              Huỷ
            </Button>
            <Button
              type="button"
              disabled={createProviderMutation.isPending || !quickProviderCode.trim() || !quickProviderName.trim()}
              onClick={async () => {
                const created = await createProviderMutation.mutateAsync({
                  code: quickProviderCode.trim(),
                  name: quickProviderName.trim(),
                  isActive: true,
                });
                handlePickProvider(created as Record<string, unknown>);
                setQuickProviderOpen(false);
              }}
            >
              {createProviderMutation.isPending ? "Đang lưu…" : "Lưu và chọn"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gợi ý nhóm / thương hiệu */}
      <Dialog open={groupPickOpen} onOpenChange={setGroupPickOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gợi ý nhóm hàng hóa</DialogTitle>
          </DialogHeader>
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {GROUP_SUGGESTIONS.map((g) => (
              <li key={g}>
                <button
                  type="button"
                  className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    setInventoryExtras((prev) => ({ ...prev, itemType: g }));
                    setGroupPickOpen(false);
                  }}
                >
                  {g}
                </button>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setGroupPickOpen(false)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={quickGroupOpen} onOpenChange={setQuickGroupOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nhập nhanh nhóm hàng</DialogTitle>
          </DialogHeader>
          <Input
            value={quickGroupDraft}
            onChange={(e) => setQuickGroupDraft(e.target.value)}
            placeholder="Tên nhóm"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setQuickGroupOpen(false)}>
              Huỷ
            </Button>
            <Button
              type="button"
              onClick={() => {
                setInventoryExtras((prev) => ({ ...prev, itemType: quickGroupDraft.trim() }));
                setQuickGroupOpen(false);
              }}
            >
              Áp dụng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={brandPickOpen} onOpenChange={setBrandPickOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gợi ý thương hiệu</DialogTitle>
          </DialogHeader>
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {BRAND_SUGGESTIONS.map((b) => (
              <li key={b}>
                <button
                  type="button"
                  className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    setInventoryExtras((prev) => ({ ...prev, brand: b }));
                    setBrandPickOpen(false);
                  }}
                >
                  {b}
                </button>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBrandPickOpen(false)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={quickBrandOpen} onOpenChange={setQuickBrandOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nhập nhanh thương hiệu</DialogTitle>
          </DialogHeader>
          <Input
            value={quickBrandDraft}
            onChange={(e) => setQuickBrandDraft(e.target.value)}
            placeholder="Tên thương hiệu"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setQuickBrandOpen(false)}>
              Huỷ
            </Button>
            <Button
              type="button"
              onClick={() => {
                setInventoryExtras((prev) => ({ ...prev, brand: quickBrandDraft.trim() }));
                setQuickBrandOpen(false);
              }}
            >
              Áp dụng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
