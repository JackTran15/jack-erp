import { useCallback, useEffect, useState } from "react";
import { formatClientError } from "@erp/api-client";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Button, Input } from "@erp/ui";
import {
  productsApi,
  type AttributeDefinition,
  type AttributeOption,
} from "../../../api/products";

interface AttributeDefinitionsFormProps {
  productId: string;
}

interface LocalOption extends Partial<AttributeOption> {
  _key: string;
  _new?: boolean;
  _dirty?: boolean;
  _deleted?: boolean;
}

interface LocalDefinition extends Partial<AttributeDefinition> {
  _key: string;
  _new?: boolean;
  _dirty?: boolean;
  _deleted?: boolean;
  _expanded?: boolean;
  _options: LocalOption[];
}

export function AttributeDefinitionsForm({
  productId,
}: AttributeDefinitionsFormProps) {
  const [definitions, setDefinitions] = useState<LocalDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchAttributes = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await productsApi.listAttributes(productId);
      const attrs = Array.isArray(data) ? data : (data as any).data ?? [];
      setDefinitions(
        attrs.map((attr: AttributeDefinition) => ({
          ...attr,
          _key: attr.id,
          _expanded: false,
          _options: attr.options.map((opt) => ({
            ...opt,
            _key: opt.id,
          })),
        })),
      );
      setError(null);
    } catch (err: unknown) {
      setError(formatClientError(err));
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void fetchAttributes();
  }, [fetchAttributes]);

  const addDefinition = () => {
    const key = `new-${Date.now()}`;
    setDefinitions((prev) => [
      ...prev,
      {
        _key: key,
        _new: true,
        _dirty: true,
        _expanded: true,
        name: "",
        sortOrder: prev.length + 1,
        _options: [],
      },
    ]);
  };

  const updateDef = (key: string, field: string, value: unknown) => {
    setDefinitions((prev) =>
      prev.map((d) =>
        d._key === key ? { ...d, [field]: value, _dirty: true } : d,
      ),
    );
  };

  const removeDef = (key: string) => {
    setDefinitions((prev) =>
      prev.map((d) =>
        d._key === key ? { ...d, _deleted: true } : d,
      ),
    );
  };

  const toggleExpand = (key: string) => {
    setDefinitions((prev) =>
      prev.map((d) =>
        d._key === key ? { ...d, _expanded: !d._expanded } : d,
      ),
    );
  };

  const addOption = (defKey: string) => {
    const optKey = `new-opt-${Date.now()}`;
    setDefinitions((prev) =>
      prev.map((d) =>
        d._key === defKey
          ? {
              ...d,
              _dirty: true,
              _options: [
                ...d._options,
                {
                  _key: optKey,
                  _new: true,
                  _dirty: true,
                  valueLabel: "",
                  codeSuffix: "",
                  sortOrder: d._options.length + 1,
                },
              ],
            }
          : d,
      ),
    );
  };

  const updateOption = (
    defKey: string,
    optKey: string,
    field: string,
    value: unknown,
  ) => {
    setDefinitions((prev) =>
      prev.map((d) =>
        d._key === defKey
          ? {
              ...d,
              _dirty: true,
              _options: d._options.map((o) =>
                o._key === optKey ? { ...o, [field]: value, _dirty: true } : o,
              ),
            }
          : d,
      ),
    );
  };

  const removeOption = (defKey: string, optKey: string) => {
    setDefinitions((prev) =>
      prev.map((d) =>
        d._key === defKey
          ? {
              ...d,
              _dirty: true,
              _options: d._options.map((o) =>
                o._key === optKey ? { ...o, _deleted: true } : o,
              ),
            }
          : d,
      ),
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      for (const def of definitions) {
        if (def._deleted && !def._new && def.id) {
          await productsApi.deleteAttribute(productId, def.id);
          continue;
        }

        let attrId = def.id;

        if (def._new && !def._deleted) {
          const { data } = await productsApi.createAttribute(productId, {
            name: def.name,
            sortOrder: def.sortOrder,
          });
          attrId = data.id;
        } else if (def._dirty && !def._new && !def._deleted && attrId) {
          await productsApi.updateAttribute(productId, attrId, {
            name: def.name,
            sortOrder: def.sortOrder,
          });
        }

        if (def._deleted || !attrId) continue;

        for (const opt of def._options) {
          if (opt._deleted && !opt._new && opt.id) {
            await productsApi.deleteOption(productId, attrId, opt.id);
          } else if (opt._new && !opt._deleted) {
            await productsApi.createOption(productId, attrId, {
              valueLabel: opt.valueLabel,
              codeSuffix: opt.codeSuffix,
              sortOrder: opt.sortOrder,
            });
          } else if (opt._dirty && !opt._new && !opt._deleted && opt.id) {
            await productsApi.updateOption(productId, attrId, opt.id, {
              valueLabel: opt.valueLabel,
              codeSuffix: opt.codeSuffix,
              sortOrder: opt.sortOrder,
            });
          }
        }
      }

      setSuccessMsg("Đã lưu thuộc tính thành công.");
      await fetchAttributes();
    } catch (err: unknown) {
      setError(formatClientError(err));
    } finally {
      setSaving(false);
    }
  };

  const visibleDefs = definitions.filter((d) => !d._deleted);
  const hasDirtyChanges = definitions.some(
    (d) => d._dirty || d._new || d._deleted,
  );

  if (loading) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Đang tải thuộc tính…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {successMsg && <p className="text-sm text-green-600">{successMsg}</p>}

      {visibleDefs.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Chưa có thuộc tính nào. Thêm thuộc tính để tạo biến thể.
        </p>
      )}

      {visibleDefs.map((def) => (
        <div
          key={def._key}
          className="rounded-lg border border-gray-200 bg-white"
        >
          <div className="flex items-center gap-2 px-3 py-2.5">
            <button
              type="button"
              onClick={() => toggleExpand(def._key)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              {def._expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>

            <Input
              value={def.name ?? ""}
              onChange={(e) => updateDef(def._key, "name", e.target.value)}
              placeholder="Tên thuộc tính (VD: Kích cỡ, Màu sắc)"
              className="flex-1"
            />

            <Input
              type="number"
              value={def.sortOrder ?? 0}
              onChange={(e) =>
                updateDef(def._key, "sortOrder", Number(e.target.value))
              }
              className="w-20 text-center"
              placeholder="STT"
            />

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 shrink-0 p-0 text-destructive"
              onClick={() => removeDef(def._key)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          {def._expanded && (
            <div className="border-t border-gray-100 px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-muted-foreground">
                  Giá trị
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addOption(def._key)}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Thêm giá trị
                </Button>
              </div>

              {def._options.filter((o) => !o._deleted).length === 0 && (
                <p className="py-2 text-xs text-muted-foreground">
                  Chưa có giá trị nào.
                </p>
              )}

              <div className="flex flex-col gap-2">
                {def._options
                  .filter((o) => !o._deleted)
                  .map((opt) => (
                    <div key={opt._key} className="flex items-center gap-2">
                      <Input
                        value={opt.valueLabel ?? ""}
                        onChange={(e) =>
                          updateOption(
                            def._key,
                            opt._key,
                            "valueLabel",
                            e.target.value,
                          )
                        }
                        placeholder="Nhãn hiển thị (VD: Đỏ, XL)"
                        className="flex-1"
                      />
                      <Input
                        value={opt.codeSuffix ?? ""}
                        onChange={(e) =>
                          updateOption(
                            def._key,
                            opt._key,
                            "codeSuffix",
                            e.target.value,
                          )
                        }
                        placeholder="Mã (VD: RED, XL)"
                        className="w-28"
                      />
                      <Input
                        type="number"
                        value={opt.sortOrder ?? 0}
                        onChange={(e) =>
                          updateOption(
                            def._key,
                            opt._key,
                            "sortOrder",
                            Number(e.target.value),
                          )
                        }
                        className="w-16 text-center"
                        placeholder="STT"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 shrink-0 p-0 text-destructive"
                        onClick={() => removeOption(def._key, opt._key)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={addDefinition}>
          <Plus className="mr-1 h-4 w-4" />
          Thêm thuộc tính
        </Button>

        {hasDirtyChanges && (
          <Button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? "Đang lưu…" : "Lưu thuộc tính"}
          </Button>
        )}
      </div>
    </div>
  );
}
