import { useEffect, useMemo, useState } from "react";
import { AppModal, Button, FormField, Input, Textarea } from "@erp/ui";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCreateItemCategory, useItemCategories } from "../hooks";
import { getUserFacingApiErrorMessage } from "../../../../../lib/user-facing-api-error";

export interface CategoryPick {
  id: string;
  name: string;
  code?: string;
}

interface CommissionDraft {
  id: string;
  positionName: string;
  method: "PERCENT" | "AMOUNT";
  rate: string;
  discountLimitPercent: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  onCreated: (category: CategoryPick) => void;
}

const METHOD_OPTIONS: Array<{ value: CommissionDraft["method"]; label: string }> = [
  { value: "PERCENT", label: "Phần trăm" },
  { value: "AMOUNT", label: "Số tiền" },
];

function blankCommission(): CommissionDraft {
  return {
    id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    positionName: "",
    method: "PERCENT",
    rate: "0",
    discountLimitPercent: "0",
  };
}

/** "Thêm mới nhóm hàng hóa" — two tabs: Thông tin chung + Hoa hồng (ref images #4 & #5). */
export function ItemCategoryCreateDialog({
  open,
  onOpenChange,
  initialName,
  onCreated,
}: Props) {
  const [tab, setTab] = useState<"general" | "commission">("general");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [parentGroupId, setParentGroupId] = useState("");
  const [description, setDescription] = useState("");
  const [commissions, setCommissions] = useState<CommissionDraft[]>([]);

  const createCategory = useCreateItemCategory();
  const parentsQuery = useItemCategories("", open);

  const parentOptions = useMemo(() => {
    const data = (parentsQuery.data?.data ?? []) as Record<string, unknown>[];
    return data.map((r) => ({ id: String(r.id ?? ""), name: String(r.name ?? "") }));
  }, [parentsQuery.data]);

  useEffect(() => {
    if (open) {
      setTab("general");
      setCode("");
      setName(initialName ?? "");
      setParentGroupId("");
      setDescription("");
      setCommissions([]);
    }
  }, [open, initialName]);

  const updateCommission = (id: string, patch: Partial<CommissionDraft>) =>
    setCommissions((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const save = async () => {
    const trimmedCode = code.trim();
    const trimmedName = name.trim();
    if (!trimmedCode || !trimmedName) {
      toast.warning("Vui lòng nhập mã và tên nhóm hàng hóa.");
      setTab("general");
      return;
    }
    const payloadCommissions = commissions
      .filter((c) => c.positionName.trim() || Number(c.rate) > 0)
      .map((c) => ({
        positionName: c.positionName.trim() || undefined,
        method: c.method,
        rate: Number(c.rate) || 0,
        discountLimitPercent: Number(c.discountLimitPercent) || 0,
      }));
    try {
      const created = (await createCategory.mutateAsync({
        code: trimmedCode,
        name: trimmedName,
        parentGroupId: parentGroupId || undefined,
        description: description.trim() || undefined,
        commissions: payloadCommissions,
      })) as Record<string, unknown>;
      onCreated({
        id: String(created.id ?? ""),
        name: String(created.name ?? trimmedName),
        code: String(created.code ?? trimmedCode),
      });
      onOpenChange(false);
      toast.success("Đã tạo nhóm hàng hóa.");
    } catch (err) {
      toast.error(getUserFacingApiErrorMessage(err));
    }
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Thêm mới nhóm hàng hóa"
      defaultWidth={720}
      defaultHeight={560}
      saveLabel={createCategory.isPending ? "Đang lưu…" : "Lưu"}
      saveDisabled={createCategory.isPending || !code.trim() || !name.trim()}
      onSave={save}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="mb-3 flex items-center gap-1 border-b">
          {(
            [
              { id: "general", label: "Thông tin chung" },
              { id: "commission", label: "Hoa hồng" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={
                tab === t.id
                  ? "border-b-2 border-primary px-3 py-2 text-sm font-medium text-foreground"
                  : "px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "general" ? (
          <div className="grid gap-3">
            <FormField layout="horizontal" label="Mã nhóm hàng hóa" htmlFor="cat-code" required>
              <Input id="cat-code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
            </FormField>
            <FormField layout="horizontal" label="Tên nhóm hàng hóa" htmlFor="cat-name" required>
              <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} />
            </FormField>
            <FormField layout="horizontal" label="Thuộc nhóm" htmlFor="cat-parent">
              <select
                id="cat-parent"
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={parentGroupId}
                onChange={(e) => setParentGroupId(e.target.value)}
              >
                <option value="">— Không —</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField layout="horizontal" label="Mô tả" htmlFor="cat-desc">
              <Textarea
                id="cat-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </FormField>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-auto rounded-md border">
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
                  {commissions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                        Chưa có cấu hình hoa hồng.
                      </td>
                    </tr>
                  ) : (
                    commissions.map((row) => (
                      <tr key={row.id} className="border-t border-border">
                        <td className="px-3 py-2">
                          <Input
                            value={row.positionName}
                            onChange={(e) =>
                              updateCommission(row.id, { positionName: e.target.value })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                            value={row.method}
                            onChange={(e) =>
                              updateCommission(row.id, {
                                method: e.target.value as CommissionDraft["method"],
                              })
                            }
                          >
                            {METHOD_OPTIONS.map((m) => (
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
                            value={row.rate}
                            onChange={(e) => updateCommission(row.id, { rate: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            inputMode="decimal"
                            className="text-right"
                            value={row.discountLimitPercent}
                            onChange={(e) =>
                              updateCommission(row.id, {
                                discountLimitPercent: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            aria-label="Xóa dòng hoa hồng"
                            className="inline-flex h-8 w-8 items-center justify-center rounded text-destructive hover:bg-destructive/10"
                            onClick={() =>
                              setCommissions((prev) => prev.filter((c) => c.id !== row.id))
                            }
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
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCommissions((prev) => [...prev, blankCommission()])}
              >
                <Plus className="mr-1 h-4 w-4" /> Thêm dòng
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppModal>
  );
}
