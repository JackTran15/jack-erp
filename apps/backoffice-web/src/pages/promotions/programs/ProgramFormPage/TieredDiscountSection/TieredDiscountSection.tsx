import { useState } from "react";
import { Button, SingleSelect } from "@erp/ui";
import { DownloadCloud, Plus, UploadCloud } from "lucide-react";
import { SectionHeader } from "../SectionHeader/SectionHeader";
import { GroupTabBar } from "./GroupTabBar/GroupTabBar";
import { ProductSelectionGrid } from "./ProductSelectionGrid/ProductSelectionGrid";
import { QuantityTierGrid } from "./QuantityTierGrid/QuantityTierGrid";
import {
  TIER_BASIS_OPTIONS,
  TIER_DISCOUNT_TYPE_OPTIONS,
  TIER_DISCOUNT_UNIT_OPTIONS,
  TIER_TARGET_OPTIONS,
  blankTierGroup,
} from "../../program-form.constants";
import type {
  ProgramFormState,
  TierBasis,
  TierDiscountUnit,
  TierGroup,
  TierProduct,
  TierRow,
  TierTarget,
} from "../../program-form.types";

interface Props {
  form: ProgramFormState;
  onChange: (patch: Partial<ProgramFormState>) => void;
}

/** Section "Giảm giá" cho loại giảm giá theo mức (số lượng hàng mua): nhóm + 2 grid lồng nhau. */
export function TieredDiscountSection({ form, onChange }: Props) {
  const groups = form.tierGroups;
  const [activeId, setActiveId] = useState(() => groups[0]?.id ?? "");
  const activeGroup =
    groups.find((g) => g.id === activeId) ?? groups[0] ?? null;

  const isAmount = form.tierDiscountUnit === "AMOUNT";
  const valueLabel = isAmount ? "Số tiền giảm" : "% giảm giá";

  const setGroups = (next: TierGroup[]) => onChange({ tierGroups: next });

  const updateActiveGroup = (patch: Partial<TierGroup>) => {
    if (!activeGroup) return;
    setGroups(
      groups.map((g) => (g.id === activeGroup.id ? { ...g, ...patch } : g)),
    );
  };

  const addGroup = () => {
    const group = blankTierGroup(groups.length + 1);
    setGroups([...groups, group]);
    setActiveId(group.id);
  };

  const removeGroup = (id: string) => {
    if (groups.length <= 1) return;
    const next = groups.filter((g) => g.id !== id);
    setGroups(next);
    if (id === activeId) setActiveId(next[0].id);
  };

  const canExport = (activeGroup?.products.length ?? 0) > 0;

  return (
    <section>
      <SectionHeader title="Giảm giá" />

      <div className="flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap items-center gap-4">
          <span className="w-28 shrink-0">Loại giảm theo</span>
          <SingleSelect
            options={TIER_DISCOUNT_TYPE_OPTIONS}
            value="QUANTITY"
            onValueChange={() => {}}
            className="w-56"
          />
          <SingleSelect
            options={TIER_DISCOUNT_UNIT_OPTIONS}
            value={form.tierDiscountUnit}
            onValueChange={(v) =>
              onChange({ tierDiscountUnit: v as TierDiscountUnit })
            }
            className="w-64"
          />
        </div>

        <div className="flex flex-wrap items-center gap-8">
          <span className="w-28 shrink-0">Tính trên</span>
          {TIER_BASIS_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-2"
            >
              <input
                type="radio"
                name="tier-basis"
                className="shrink-0 accent-primary"
                checked={form.tierBasis === opt.value}
                onChange={() => onChange({ tierBasis: opt.value as TierBasis })}
              />
              {opt.label}
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-8">
          <span className="w-28 shrink-0">Giảm giá theo</span>
          {TIER_TARGET_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-2"
            >
              <input
                type="radio"
                name="tier-target"
                className="shrink-0 accent-primary"
                checked={form.tierTarget === opt.value}
                onChange={() =>
                  onChange({ tierTarget: opt.value as TierTarget })
                }
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-primary text-primary"
          onClick={addGroup}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Thêm nhóm
        </Button>
        <div className="flex items-center gap-6 text-sm font-bold">
          <button
            type="button"
            className="flex items-center gap-2 text-primary hover:opacity-70"
          >
            <UploadCloud className="h-4 w-4" />
            Nhập khẩu
          </button>
          <button
            type="button"
            disabled={!canExport}
            aria-disabled={!canExport}
            title={canExport ? undefined : "Chưa có dữ liệu để xuất"}
            className="flex items-center gap-2 text-primary hover:opacity-70 disabled:pointer-events-none disabled:text-muted-foreground"
          >
            <DownloadCloud className="h-4 w-4" />
            Xuất khẩu
          </button>
        </div>
      </div>

      {activeGroup ? (
        <div className="mt-2">
          <GroupTabBar
            groups={groups}
            activeId={activeGroup.id}
            onSelect={setActiveId}
            onRemove={removeGroup}
          />
          <div className="mt-3 flex flex-col gap-5">
            <ProductSelectionGrid
              target={form.tierTarget}
              value={activeGroup.products}
              onChange={(products: TierProduct[]) =>
                updateActiveGroup({ products })
              }
            />
            <div>
              <div className="mb-2 text-sm">Số lượng mua</div>
              <QuantityTierGrid
                value={activeGroup.tiers}
                onChange={(tiers: TierRow[]) => updateActiveGroup({ tiers })}
                valueLabel={valueLabel}
                isAmount={isAmount}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
