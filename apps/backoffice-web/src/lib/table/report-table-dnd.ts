import type { ReportColumnConfig } from "../../constants/reports/report.interface";

// Token kéo-thả: cấp top (cột đơn hoặc group) hoặc cấp con (leaf trong group).
export type DragToken =
  | { level: "top"; key: string }
  | { level: "child"; id: string; group: string };

interface TopUnit {
  key: string; // columnId (cột đơn) hoặc `group:<label>`
  ids: string[];
}

function buildTopUnits(order: string[], configById: Map<string, ReportColumnConfig>): TopUnit[] {
  const units: TopUnit[] = [];
  for (const id of order) {
    const group = configById.get(id)?.group ?? null;
    const key = group ? `group:${group}` : id;
    const last = units[units.length - 1];
    if (group && last && last.key === key) last.ids.push(id);
    else units.push({ key, ids: [id] });
  }
  return units;
}

const moveItem = <T,>(list: T[], from: number, to: number): T[] => {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

export const cellKey = (token: DragToken): string =>
  token.level === "top" ? `top:${token.key}` : `child:${token.group}:${token.id}`;

// Hai token có thả được lên nhau không (cùng cấp; child phải cùng group; không trùng chính nó).
export function canDrop(source: DragToken, target: DragToken): boolean {
  if (source.level === "top" && target.level === "top") return source.key !== target.key;
  if (source.level === "child" && target.level === "child")
    return source.group === target.group && source.id !== target.id;
  return false;
}

// Các column id bị ảnh hưởng khi kéo token (group → cả cụm) — dùng để bỏ ghim.
export function draggedColumnIds(
  source: DragToken,
  order: string[],
  configById: Map<string, ReportColumnConfig>,
): string[] {
  if (source.level === "child") return [source.id];
  const unit = buildTopUnits(order, configById).find((u) => u.key === source.key);
  return unit ? unit.ids : [];
}

// Tính order mới khi thả `source` lên `target`. Group đổi cả cụm; leaf chỉ đổi trong cùng group.
export function reorderByDrag(
  order: string[],
  configById: Map<string, ReportColumnConfig>,
  source: DragToken,
  target: DragToken,
): string[] | null {
  const units = buildTopUnits(order, configById);
  if (source.level === "top" && target.level === "top") {
    if (source.key === target.key) return null;
    const from = units.findIndex((u) => u.key === source.key);
    const to = units.findIndex((u) => u.key === target.key);
    if (from < 0 || to < 0) return null;
    return moveItem(units, from, to).flatMap((u) => u.ids);
  }
  if (source.level === "child" && target.level === "child" && source.group === target.group) {
    if (source.id === target.id) return null;
    const gi = units.findIndex((u) => u.key === `group:${source.group}`);
    if (gi < 0) return null;
    const from = units[gi].ids.indexOf(source.id);
    const to = units[gi].ids.indexOf(target.id);
    if (from < 0 || to < 0) return null;
    const next = [...units];
    next[gi] = { ...units[gi], ids: moveItem(units[gi].ids, from, to) };
    return next.flatMap((u) => u.ids);
  }
  return null;
}
