import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  Input,
} from "@erp/ui";
import { BRAND_SUGGESTIONS, GROUP_SUGGESTIONS } from "./constants";

interface InventoryItemCreateDialogsProps {
  categoryPickOpen: boolean;
  setCategoryPickOpen: Dispatch<SetStateAction<boolean>>;
  categoryOptions: string[];
  handlePickCategory: (label: string) => void;
  quickCategoryOpen: boolean;
  setQuickCategoryOpen: Dispatch<SetStateAction<boolean>>;
  quickCategoryDraft: string;
  setQuickCategoryDraft: Dispatch<SetStateAction<string>>;
  providerPickOpen: boolean;
  setProviderPickOpen: Dispatch<SetStateAction<boolean>>;
  providerSearch: string;
  setProviderSearch: Dispatch<SetStateAction<string>>;
  providersLoading: boolean;
  providerFetch: { data?: Record<string, unknown>[] } | null | undefined;
  handlePickProvider: (row: Record<string, unknown>) => void;
  quickProviderOpen: boolean;
  setQuickProviderOpen: Dispatch<SetStateAction<boolean>>;
  quickProviderCode: string;
  setQuickProviderCode: Dispatch<SetStateAction<string>>;
  quickProviderName: string;
  setQuickProviderName: Dispatch<SetStateAction<string>>;
  createProviderMutation: {
    isPending: boolean;
    mutateAsync: (payload: { code: string; name: string; isActive: boolean }) => Promise<unknown>;
  };
  groupPickOpen: boolean;
  setGroupPickOpen: Dispatch<SetStateAction<boolean>>;
  quickGroupOpen: boolean;
  setQuickGroupOpen: Dispatch<SetStateAction<boolean>>;
  quickGroupDraft: string;
  setQuickGroupDraft: Dispatch<SetStateAction<string>>;
  brandPickOpen: boolean;
  setBrandPickOpen: Dispatch<SetStateAction<boolean>>;
  quickBrandOpen: boolean;
  setQuickBrandOpen: Dispatch<SetStateAction<boolean>>;
  quickBrandDraft: string;
  setQuickBrandDraft: Dispatch<SetStateAction<string>>;
  setValues: Dispatch<SetStateAction<Record<string, unknown>>>;
  onApplyQuickCategory: () => Promise<void>;
  isApplyingQuickCategory: boolean;
}

function normalizeSearch(s: string): string {
  return s.trim().toLowerCase();
}

export function InventoryItemCreateDialogs({
  categoryPickOpen,
  setCategoryPickOpen,
  categoryOptions,
  handlePickCategory,
  quickCategoryOpen,
  setQuickCategoryOpen,
  quickCategoryDraft,
  setQuickCategoryDraft,
  providerPickOpen,
  setProviderPickOpen,
  providerSearch,
  setProviderSearch,
  providersLoading,
  providerFetch,
  handlePickProvider,
  quickProviderOpen,
  setQuickProviderOpen,
  quickProviderCode,
  setQuickProviderCode,
  quickProviderName,
  setQuickProviderName,
  createProviderMutation,
  groupPickOpen,
  setGroupPickOpen,
  quickGroupOpen,
  setQuickGroupOpen,
  quickGroupDraft,
  setQuickGroupDraft,
  brandPickOpen,
  setBrandPickOpen,
  quickBrandOpen,
  setQuickBrandOpen,
  quickBrandDraft,
  setQuickBrandDraft,
  setValues,
  onApplyQuickCategory,
  isApplyingQuickCategory,
}: InventoryItemCreateDialogsProps) {
  const [categoryPickSearch, setCategoryPickSearch] = useState("");
  const [groupPickSearch, setGroupPickSearch] = useState("");
  const [brandPickSearch, setBrandPickSearch] = useState("");

  useEffect(() => {
    if (categoryPickOpen) setCategoryPickSearch("");
  }, [categoryPickOpen]);

  useEffect(() => {
    if (groupPickOpen) setGroupPickSearch("");
  }, [groupPickOpen]);

  useEffect(() => {
    if (brandPickOpen) setBrandPickSearch("");
  }, [brandPickOpen]);

  const filteredCategoryOptions = useMemo(() => {
    const q = normalizeSearch(categoryPickSearch);
    if (!q) return categoryOptions;
    return categoryOptions.filter((c) => normalizeSearch(c).includes(q));
  }, [categoryOptions, categoryPickSearch]);

  const filteredGroupSuggestions = useMemo(() => {
    const q = normalizeSearch(groupPickSearch);
    if (!q) return GROUP_SUGGESTIONS;
    return GROUP_SUGGESTIONS.filter((g) => normalizeSearch(g).includes(q));
  }, [groupPickSearch]);

  const filteredBrandSuggestions = useMemo(() => {
    const q = normalizeSearch(brandPickSearch);
    if (!q) return BRAND_SUGGESTIONS;
    return BRAND_SUGGESTIONS.filter((b) => normalizeSearch(b).includes(q));
  }, [brandPickSearch]);

  const providerRows = providerFetch?.data ?? [];

  return (
    <>
      <Dialog open={categoryPickOpen} onOpenChange={setCategoryPickOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chọn danh mục</DialogTitle>
            <DialogDescription>
              Danh sách gồm danh mục đã lưu và danh mục suy ra từ mặt hàng hiện có. Chọn một dòng để
              điền vào biểu mẫu.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Tìm trong danh sách…"
            value={categoryPickSearch}
            onChange={(e) => setCategoryPickSearch(e.target.value)}
            className="mb-2"
            aria-label="Lọc danh mục"
          />
          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
            {categoryOptions.length === 0 ? (
              <li className="text-sm text-muted-foreground">
                Chưa có danh mục nào trong hệ thống.
              </li>
            ) : filteredCategoryOptions.length === 0 ? (
              <li className="text-sm text-muted-foreground">Không có mục khớp bộ lọc.</li>
            ) : (
              filteredCategoryOptions.map((c) => (
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
            <DialogDescription>
              Tạo danh mục trong hệ thống ngay bây giờ và điền vào ô Danh mục trên biểu mẫu (không cần
              bấm Lưu bên ngoài).
            </DialogDescription>
          </DialogHeader>
          <Input
            value={quickCategoryDraft}
            onChange={(e) => setQuickCategoryDraft(e.target.value)}
            placeholder="Tên danh mục"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setQuickCategoryOpen(false)}>
              Hủy
            </Button>
            <Button
              type="button"
              disabled={isApplyingQuickCategory || !quickCategoryDraft.trim()}
              onClick={() => void onApplyQuickCategory()}
            >
              {isApplyingQuickCategory ? "Đang tạo…" : "Áp dụng"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={providerPickOpen} onOpenChange={setProviderPickOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-lg flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Tìm nhà cung cấp</DialogTitle>
            <DialogDescription>
              Gõ để tìm theo mã, tên hoặc email trên máy chủ — chọn một NCC để gán.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Tìm trong danh sách…"
            value={providerSearch}
            onChange={(e) => setProviderSearch(e.target.value)}
            className="mb-2"
            aria-label="Tìm nhà cung cấp"
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
                  {providerRows.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-2 py-4 text-center text-sm text-muted-foreground">
                        Không có kết quả phù hợp.
                      </td>
                    </tr>
                  ) : (
                    providerRows.map((row) => (
                      <tr
                        key={String(row.id)}
                        className="cursor-pointer border-t border-border hover:bg-accent/50"
                        onClick={() => handlePickProvider(row)}
                      >
                        <td className="px-2 py-2">{String(row.code ?? "")}</td>
                        <td className="px-2 py-2">{String(row.name ?? "")}</td>
                      </tr>
                    ))
                  )}
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
              Hủy
            </Button>
            <Button
              type="button"
              disabled={
                createProviderMutation.isPending ||
                !quickProviderCode.trim() ||
                !quickProviderName.trim()
              }
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
              {createProviderMutation.isPending ? "Đang tạo…" : "Áp dụng"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={groupPickOpen} onOpenChange={setGroupPickOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gợi ý nhóm hàng hóa</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Tìm trong danh sách…"
            value={groupPickSearch}
            onChange={(e) => setGroupPickSearch(e.target.value)}
            className="mb-2"
            aria-label="Lọc nhóm hàng"
          />
          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
            {filteredGroupSuggestions.length === 0 ? (
              <li className="text-sm text-muted-foreground">Không có mục khớp bộ lọc.</li>
            ) : (
              filteredGroupSuggestions.map((g) => (
                <li key={g}>
                  <button
                    type="button"
                    className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={() => {
                      setValues((prev) => ({ ...prev, itemType: g }));
                      setGroupPickOpen(false);
                    }}
                  >
                    {g}
                  </button>
                </li>
              ))
            )}
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
              Hủy
            </Button>
            <Button
              type="button"
              onClick={() => {
                setValues((prev) => ({ ...prev, itemType: quickGroupDraft.trim() }));
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
          <Input
            placeholder="Tìm trong danh sách…"
            value={brandPickSearch}
            onChange={(e) => setBrandPickSearch(e.target.value)}
            className="mb-2"
            aria-label="Lọc thương hiệu"
          />
          <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
            {filteredBrandSuggestions.length === 0 ? (
              <li className="text-sm text-muted-foreground">Không có mục khớp bộ lọc.</li>
            ) : (
              filteredBrandSuggestions.map((b) => (
                <li key={b}>
                  <button
                    type="button"
                    className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={() => {
                      setValues((prev) => ({ ...prev, brand: b }));
                      setBrandPickOpen(false);
                    }}
                  >
                    {b}
                  </button>
                </li>
              ))
            )}
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
              Hủy
            </Button>
            <Button
              type="button"
              onClick={() => {
                setValues((prev) => ({ ...prev, brand: quickBrandDraft.trim() }));
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
