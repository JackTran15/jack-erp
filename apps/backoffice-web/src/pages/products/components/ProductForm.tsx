import { useRef, useState } from "react";
import { formatClientError } from "@erp/api-client";
import { Button, Input, Textarea } from "@erp/ui";
import { productsApi, type Product } from "../../../api/products";

interface ProductFormProps {
  product?: Product;
  onSaved: (product: Product) => void;
  onCancel?: () => void;
}

export function ProductForm({ product, onSaved, onCancel }: ProductFormProps) {
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [isActive, setIsActive] = useState(product?.isActive ?? true);
  const [defaultProviderId, setDefaultProviderId] = useState(
    product?.defaultProviderId ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const isEdit = Boolean(product);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Tên sản phẩm không được để trống.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        isActive,
        defaultProviderId: defaultProviderId.trim() || undefined,
      };
      const { data } = isEdit
        ? await productsApi.update(product!.id, payload)
        : await productsApi.create(payload);
      onSaved(data);
    } catch (err: unknown) {
      setError(formatClientError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-4"
      onSubmit={(e) => void handleSubmit(e)}
    >
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="pf-name" className="text-sm font-medium">
          Tên sản phẩm <span className="text-destructive">*</span>
        </label>
        <Input
          id="pf-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nhập tên sản phẩm"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="pf-desc" className="text-sm font-medium">
          Mô tả
        </label>
        <Textarea
          id="pf-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Mô tả sản phẩm (tuỳ chọn)"
          rows={3}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="pf-provider" className="text-sm font-medium">
          Nhà cung cấp mặc định
        </label>
        <Input
          id="pf-provider"
          value={defaultProviderId}
          onChange={(e) => setDefaultProviderId(e.target.value)}
          placeholder="ID nhà cung cấp (tuỳ chọn)"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        <span>Trạng thái hoạt động</span>
      </label>

      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Huỷ
          </Button>
        )}
        <Button type="submit" disabled={saving}>
          {saving ? "Đang lưu…" : isEdit ? "Cập nhật" : "Tạo sản phẩm"}
        </Button>
      </div>
    </form>
  );
}
