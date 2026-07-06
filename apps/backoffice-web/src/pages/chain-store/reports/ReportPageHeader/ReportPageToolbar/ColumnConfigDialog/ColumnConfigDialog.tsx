import { useEffect, useMemo, useState } from "react";
import type { ReportTemplateColumn } from "@erp/shared-interfaces";
import { AppModal, Button } from "@erp/ui";
import { HelpCircle, Save, X } from "lucide-react";
import { toast } from "sonner";
import type { ReportColumnConfig } from "../../../../../../constants/reports/report.interface";
import { getReportTypeLabel } from "../../../../../../constants/reports/report-type.constant";
import { useReportStore } from "../../../../../../store/page-stores/report/report.context";
import { useTableStore } from "../../../../../../store/common/table-store/table.context";
import { useReportColumnTemplate } from "../../../_api/report-template.api";
import {
  ColumnConfigTable,
  type ColumnConfigRow,
  type TriState,
} from "./ColumnConfigTable/ColumnConfigTable";
import { ReorderButtonGroup } from "./ReorderButtonGroup/ReorderButtonGroup";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Selection = { kind: "group"; label: string } | { kind: "column"; id: string } | null;

interface Draft {
  order: string[];
  visibility: Record<string, boolean>;
  pinning: { left: string[]; right: string[] };
}

type Unit = { kind: "group"; label: string; ids: string[] } | { kind: "column"; id: string };

function buildUnits(order: string[], configById: Map<string, ReportColumnConfig>): Unit[] {
  const units: Unit[] = [];
  for (const id of order) {
    const group = configById.get(id)?.group ?? null;
    if (!group) {
      units.push({ kind: "column", id });
      continue;
    }
    const last = units[units.length - 1];
    if (last && last.kind === "group" && last.label === group) last.ids.push(id);
    else units.push({ kind: "group", label: group, ids: [id] });
  }
  return units;
}

const flattenUnits = (units: Unit[]): string[] =>
  units.flatMap((u) => (u.kind === "group" ? u.ids : [u.id]));

const isPinned = (draft: Draft, id: string) =>
  draft.pinning.left.includes(id) || draft.pinning.right.includes(id);

function togglePin(draft: Draft, id: string): Draft {
  const pinned = isPinned(draft, id);
  const left = draft.pinning.left.filter((x) => x !== id);
  const right = draft.pinning.right.filter((x) => x !== id);
  return { ...draft, pinning: pinned ? { left, right } : { left: [...left, id], right } };
}

function setPin(draft: Draft, id: string, value: boolean): Draft {
  if (isPinned(draft, id) === value) return draft;
  return togglePin(draft, id);
}

function aggregate(values: boolean[]): TriState {
  if (values.every(Boolean)) return "checked";
  if (values.every((v) => !v)) return "unchecked";
  return "indeterminate";
}

function seedFromColumnsState(
  order: string[],
  visibility: Record<string, boolean>,
  pinning: { left?: string[]; right?: string[] },
): Draft {
  return {
    order: [...order],
    visibility: { ...visibility },
    pinning: { left: [...(pinning.left ?? [])], right: [...(pinning.right ?? [])] },
  };
}

function reorder(
  draft: Draft,
  selection: Selection,
  dir: "up" | "down",
  configById: Map<string, ReportColumnConfig>,
): Draft | null {
  if (!selection) return null;
  const units = buildUnits(draft.order, configById);
  const delta = dir === "up" ? -1 : 1;

  const swapUnits = (i: number): Draft | null => {
    const j = i + delta;
    if (i < 0 || j < 0 || j >= units.length) return null;
    const next = [...units];
    [next[i], next[j]] = [next[j], next[i]];
    return { ...draft, order: flattenUnits(next) };
  };

  if (selection.kind === "group") {
    return swapUnits(units.findIndex((u) => u.kind === "group" && u.label === selection.label));
  }

  const group = configById.get(selection.id)?.group ?? null;
  if (!group) {
    return swapUnits(units.findIndex((u) => u.kind === "column" && u.id === selection.id));
  }

  const gi = units.findIndex((u) => u.kind === "group" && u.label === group);
  const unit = units[gi];
  if (!unit || unit.kind !== "group") return null;
  const k = unit.ids.indexOf(selection.id);
  const j = k + delta;
  if (j < 0 || j >= unit.ids.length) return null;
  const ids = [...unit.ids];
  [ids[k], ids[j]] = [ids[j], ids[k]];
  const next = [...units];
  next[gi] = { ...unit, ids };
  return { ...draft, order: flattenUnits(next) };
}

export function ColumnConfigDialog({ open, onClose }: Props) {
  const reportType = useReportStore((s) => s.reportType);
  const reportName = getReportTypeLabel(reportType);
  const config = useTableStore((s) => s.config);
  const order = useTableStore((s) => s.columns.order);
  const visibility = useTableStore((s) => s.columns.visibility);
  const pinning = useTableStore((s) => s.columns.pinning);
  const columnsActions = useTableStore((s) => s.columnsActions);

  const configById = useMemo(() => {
    const map = new Map<string, ReportColumnConfig>();
    for (const col of config.columns) map.set(col.column, col);
    return map;
  }, [config.columns]);

  const [draft, setDraft] = useState<Draft>(() => seedFromColumnsState(order, visibility, pinning));
  const [selection, setSelection] = useState<Selection>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Seed lại draft từ store mỗi lần mở dialog.
  useEffect(() => {
    if (open) {
      setDraft(seedFromColumnsState(order, visibility, pinning));
      setSelection(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const units = useMemo(() => buildUnits(draft.order, configById), [draft.order, configById]);
  const allColumnIds = draft.order;

  const labelOf = (id: string) => configById.get(id)?.label ?? id;

  const rows: ColumnConfigRow[] = [];
  for (const unit of units) {
    if (unit.kind === "column") {
      rows.push({
        kind: "column",
        id: unit.id,
        indented: false,
        dataLabel: labelOf(unit.id),
        displayLabel: labelOf(unit.id),
        visible: draft.visibility[unit.id] !== false,
        pinned: isPinned(draft, unit.id),
        selected: selection?.kind === "column" && selection.id === unit.id,
      });
    } else {
      const isOpen = expanded[unit.label] ?? true;
      rows.push({
        kind: "group",
        label: unit.label,
        expanded: isOpen,
        visibility: aggregate(unit.ids.map((id) => draft.visibility[id] !== false)),
        pinned: aggregate(unit.ids.map((id) => isPinned(draft, id))),
        selected: selection?.kind === "group" && selection.label === unit.label,
      });
      if (isOpen) {
        for (const id of unit.ids) {
          rows.push({
            kind: "column",
            id,
            indented: true,
            dataLabel: labelOf(id),
            displayLabel: labelOf(id),
            visible: draft.visibility[id] !== false,
            pinned: isPinned(draft, id),
            selected: selection?.kind === "column" && selection.id === id,
          });
        }
      }
    }
  }

  const headerVisibility = aggregate(allColumnIds.map((id) => draft.visibility[id] !== false));
  const headerPinned = aggregate(allColumnIds.map((id) => isPinned(draft, id)));

  const groupIds = (label: string) =>
    (units.find((u) => u.kind === "group" && u.label === label) as
      | { kind: "group"; label: string; ids: string[] }
      | undefined)?.ids ?? [];

  const handleToggleVisibility = (row: ColumnConfigRow) =>
    setDraft((d) => {
      if (row.kind === "column") {
        return { ...d, visibility: { ...d.visibility, [row.id]: d.visibility[row.id] === false } };
      }
      const ids = groupIds(row.label);
      const target = !ids.every((id) => d.visibility[id] !== false);
      const next = { ...d.visibility };
      for (const id of ids) next[id] = target;
      return { ...d, visibility: next };
    });

  const handleTogglePinned = (row: ColumnConfigRow) =>
    setDraft((d) => {
      if (row.kind === "column") return togglePin(d, row.id);
      const ids = groupIds(row.label);
      const target = !ids.every((id) => isPinned(d, id));
      return ids.reduce((acc, id) => setPin(acc, id, target), d);
    });

  const handleToggleHeaderVisibility = () =>
    setDraft((d) => {
      const target = !allColumnIds.every((id) => d.visibility[id] !== false);
      const next: Record<string, boolean> = {};
      for (const id of allColumnIds) next[id] = target;
      return { ...d, visibility: next };
    });

  const handleToggleHeaderPinned = () =>
    setDraft((d) => {
      const target = !allColumnIds.every((id) => isPinned(d, id));
      return allColumnIds.reduce((acc, id) => setPin(acc, id, target), d);
    });

  const canUp = Boolean(reorder(draft, selection, "up", configById));
  const canDown = Boolean(reorder(draft, selection, "down", configById));

  const move = (dir: "up" | "down") => {
    const next = reorder(draft, selection, dir, configById);
    if (next) setDraft(next);
  };

  // Persistence backend ("Hiển thị cột" lưu qua templates API) — hiện bật cho báo cáo kho.
  const { enabled: templateEnabled, saveMutation } = useReportColumnTemplate();

  const applyDraftLocally = () => {
    columnsActions.setOrder(draft.order);
    columnsActions.setVisibility(draft.visibility);
    columnsActions.setPinning(draft.pinning);
  };

  const handleSave = () => {
    if (!templateEnabled) {
      applyDraftLocally();
      onClose();
      return;
    }
    // order chốt theo vị trí mảng (backend tự stamp lại từ index).
    const records: ReportTemplateColumn[] = draft.order.map((col, index) => ({
      col,
      displayName: null,
      visible: draft.visibility[col] !== false,
      frozen: isPinned(draft, col),
      order: index,
    }));
    saveMutation.mutate(records, {
      onSuccess: () => {
        applyDraftLocally();
        onClose();
      },
      onError: () => {
        toast.error("Không thể lưu cấu hình cột. Vui lòng thử lại.");
      },
    });
  };

  const handleResetDefault = () => {
    const seed = seedFromColumnsState(
      [...config.columns].sort((a, b) => a.order - b.order).map((c) => c.column),
      Object.fromEntries(config.columns.map((c) => [c.column, c.visible !== false])),
      {
        left: config.columns.filter((c) => c.tableConfig?.pinned === "left").map((c) => c.column),
        right: config.columns.filter((c) => c.tableConfig?.pinned === "right").map((c) => c.column),
      },
    );
    setDraft(seed);
    setSelection(null);
  };

  return (
    <AppModal
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Sửa mẫu"
      defaultWidth={1040}
      defaultHeight={640}
      footer={
        <div className="flex items-center sm:justify-between">
          <button
            type="button"
            className="flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline"
          >
            <HelpCircle className="h-4 w-4" />
            Trợ giúp
          </button>
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" size="sm" onClick={handleResetDefault}>
              Lấy mẫu ngầm định
            </Button>
            <Button
              type="button"
              size="sm"
              className="!bg-primary-blue !text-white hover:!bg-primary-blue-hover"
              onClick={handleSave}
            >
              <Save className="mr-1.5 h-4 w-4" />
              Lưu
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              <X className="mr-1.5 h-4 w-4" />
              Hủy bỏ
            </Button>
          </div>
        </div>
      }
    >
      <div className="mb-3 text-sm font-semibold uppercase">{reportName}</div>
      <div className="flex items-center gap-4">
        <div className="max-h-[60vh] min-h-0 flex-1 overflow-auto border border-border">
          <ColumnConfigTable
            rows={rows}
            headerVisibility={headerVisibility}
            headerPinned={headerPinned}
            onToggleHeaderVisibility={handleToggleHeaderVisibility}
            onToggleHeaderPinned={handleToggleHeaderPinned}
            onSelectRow={(row) =>
              setSelection(
                row.kind === "group"
                  ? { kind: "group", label: row.label }
                  : { kind: "column", id: row.id },
              )
            }
            onToggleExpand={(label) =>
              setExpanded((e) => ({ ...e, [label]: !(e[label] ?? true) }))
            }
            onToggleVisibility={handleToggleVisibility}
            onTogglePinned={handleTogglePinned}
          />
        </div>
        <div>
          <ReorderButtonGroup
            canUp={canUp}
            canDown={canDown}
            onUp={() => move("up")}
            onDown={() => move("down")}
          />
        </div>
      </div>
    </AppModal>
  );
}
