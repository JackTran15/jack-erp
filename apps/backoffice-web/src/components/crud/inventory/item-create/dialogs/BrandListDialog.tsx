import { useMemo, useState } from "react";
import { AppModal, Button, Input } from "@erp/ui";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useBrands, useCreateBrand, useDeleteBrand } from "../hooks";
import { getUserFacingApiErrorMessage } from "../../../../../lib/user-facing-api-error";
import type { BrandPick } from "./BrandCreateDialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (brand: BrandPick) => void;
}

/** "Danh sách thương hiệu" — list + inline quick-add + delete + pick (ref image #6). */
export function BrandListDialog({ open, onOpenChange, onPick }: Props) {
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const brandsQuery = useBrands(search, open);
  const createBrand = useCreateBrand();
  const deleteBrand = useDeleteBrand();

  const rows = useMemo(() => {
    const data = (brandsQuery.data?.data ?? []) as Record<string, unknown>[];
    return data.map((r) => ({ id: String(r.id ?? ""), name: String(r.name ?? "") }));
  }, [brandsQuery.data]);

  const addBrand = async () => {
    const name = draft.trim();
    if (!name) return;
    try {
      await createBrand.mutateAsync({ name });
      setDraft("");
      toast.success("Đã thêm thương hiệu.");
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    }
  };

  const removeBrand = async (id: string) => {
    try {
      await deleteBrand.mutateAsync(id);
      toast.success("Đã xóa thương hiệu.");
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    }
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Danh sách thương hiệu"
      defaultWidth={560}
      defaultHeight={520}
      showFooter={false}
    >
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addBrand();
            }}
            placeholder="Nhập tên thương hiệu để thêm nhanh…"
          />
          <Button
            type="button"
            size="sm"
            onClick={() => void addBrand()}
            disabled={createBrand.isPending || !draft.trim()}
          >
            <Plus className="mr-1 h-4 w-4" /> Thêm
          </Button>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm thương hiệu…"
        />
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted [&_th]:bg-muted">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Tên thương hiệu</th>
                <th className="w-12 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {brandsQuery.isLoading ? (
                <tr>
                  <td colSpan={2} className="px-3 py-4 text-center text-muted-foreground">
                    Đang tải…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-3 py-4 text-center text-muted-foreground">
                    Chưa có thương hiệu nào.
                  </td>
                </tr>
              ) : (
                rows.map((b) => (
                  <tr key={b.id} className="border-t border-border hover:bg-accent/50">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => {
                          onPick(b);
                          onOpenChange(false);
                        }}
                      >
                        {b.name}
                      </button>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        aria-label="Xóa thương hiệu"
                        className="inline-flex h-7 w-7 items-center justify-center rounded text-destructive hover:bg-destructive/10"
                        onClick={() => void removeBrand(b.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppModal>
  );
}
