import { useMemo, useState } from "react";
import { Button, Input } from "@erp/ui";
import { Plus, Trash2 } from "lucide-react";
import { useProviders } from "./hooks";
import {
  ProviderCreateDialog,
  type ProviderPick,
} from "./dialogs/ProviderCreateDialog";

export interface ItemProviderRow {
  rowId: string;
  providerId: string;
  code: string;
  name: string;
  address: string;
  isPrimary: boolean;
}

interface Props {
  rows: ItemProviderRow[];
  setRows: React.Dispatch<React.SetStateAction<ItemProviderRow[]>>;
}

export function createBlankProviderRow(): ItemProviderRow {
  return {
    rowId: `prov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    providerId: "",
    code: "",
    name: "",
    address: "",
    isPrimary: false,
  };
}

/** Multiple-supplier table for an item (ref image #8). Syncs to `providers[]`. */
export function ItemProvidersTable({ rows, setRows }: Props) {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const providersQuery = useProviders(search, true);

  const options = useMemo(() => {
    const data = (providersQuery.data?.data ?? []) as Record<string, unknown>[];
    return data.map((r) => ({
      id: String(r.id ?? ""),
      code: String(r.code ?? ""),
      name: String(r.name ?? ""),
      address: String(r.address ?? ""),
    }));
  }, [providersQuery.data]);

  const pickedIds = useMemo(
    () => new Set(rows.map((r) => r.providerId).filter(Boolean)),
    [rows],
  );

  const assignProvider = (rowId: string, opt: ProviderPick) => {
    setRows((prev) => {
      if (prev.some((r) => r.providerId === opt.id && r.rowId !== rowId)) return prev;
      const next = prev.map((r) =>
        r.rowId === rowId
          ? { ...r, providerId: opt.id, code: opt.code, name: opt.name, address: opt.address }
          : r,
      );
      // Ensure exactly one primary.
      if (!next.some((r) => r.isPrimary && r.providerId)) {
        const first = next.find((r) => r.providerId);
        if (first) first.isPrimary = true;
      }
      return [...next];
    });
  };

  const setPrimary = (rowId: string) =>
    setRows((prev) => prev.map((r) => ({ ...r, isPrimary: r.rowId === rowId })));

  const removeRow = (rowId: string) =>
    setRows((prev) => {
      const next = prev.filter((r) => r.rowId !== rowId);
      if (next.length && !next.some((r) => r.isPrimary)) {
        const first = next.find((r) => r.providerId);
        if (first) first.isPrimary = true;
      }
      return [...next];
    });

  return (
    <>
      <div className="mb-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm nhà cung cấp theo mã hoặc tên…"
        />
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase">
            <tr>
              <th className="w-12 px-2 py-2 text-center">STT</th>
              <th className="px-3 py-2 text-left">Mã nhà cung cấp</th>
              <th className="px-3 py-2 text-left">Tên nhà cung cấp</th>
              <th className="px-3 py-2 text-left">Địa chỉ</th>
              <th className="w-20 px-2 py-2 text-center">Mặc định</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  Chưa có nhà cung cấp. Bấm "Thêm dòng" để chọn.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={row.rowId} className="border-t border-border">
                  <td className="px-2 py-2 text-center text-muted-foreground">{idx + 1}</td>
                  <td className="px-3 py-2">
                    {row.providerId ? (
                      <span className="font-mono text-xs">{row.code}</span>
                    ) : (
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        value=""
                        onChange={(e) => {
                          const opt = options.find((o) => o.id === e.target.value);
                          if (opt) assignProvider(row.rowId, opt);
                        }}
                      >
                        <option value="">— Chọn nhà cung cấp —</option>
                        {options
                          .filter((o) => !pickedIds.has(o.id))
                          .map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.code} · {o.name}
                            </option>
                          ))}
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{row.address}</td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="radio"
                      name="provider-primary"
                      checked={row.isPrimary}
                      disabled={!row.providerId}
                      onChange={() => setPrimary(row.rowId)}
                      className="h-4 w-4 accent-primary"
                      aria-label="Đặt làm nhà cung cấp mặc định"
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      aria-label="Xóa dòng"
                      className="inline-flex h-7 w-7 items-center justify-center rounded text-destructive hover:bg-destructive/10"
                      onClick={() => removeRow(row.rowId)}
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
      <div className="mt-2 flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRows((prev) => [...prev, createBlankProviderRow()])}
        >
          <Plus className="mr-1 h-4 w-4" /> Thêm dòng
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Tạo nhà cung cấp mới
        </Button>
      </div>

      <ProviderCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(prov) => {
          setRows((prev) => {
            const blank = prev.find((r) => !r.providerId);
            const target = blank ?? createBlankProviderRow();
            const next = blank ? [...prev] : [...prev, target];
            return next.map((r) =>
              r.rowId === target.rowId
                ? {
                    ...r,
                    providerId: prov.id,
                    code: prov.code,
                    name: prov.name,
                    address: prov.address,
                    isPrimary: !prev.some((p) => p.isPrimary && p.providerId),
                  }
                : r,
            );
          });
        }}
      />
    </>
  );
}
