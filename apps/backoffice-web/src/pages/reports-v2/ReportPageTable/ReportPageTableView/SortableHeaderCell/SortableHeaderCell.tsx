import type { CSSProperties, ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";

// Dữ liệu gắn vào mỗi ô kéo-thả: cấp top (cột đơn / group) hoặc cấp con (leaf trong group).
export type DragData =
  | { level: "top"; key: string }
  | { level: "child"; id: string; group: string };

interface Props {
  id: string;
  data: DragData;
  // Cha tính: con trỏ đang ở trên ô này và là điểm thả hợp lệ → bật viền chỉ-báo.
  validOver: boolean;
  colSpan?: number;
  rowSpan?: number;
  style?: CSSProperties;
  className?: string;
  children: ReactNode;
  resizeHandle?: ReactNode;
}

// Header cell kéo-thả bằng @dnd-kit. KHÔNG áp transform của useSortable (phá position: sticky của cột ghim);
// phản hồi kéo dùng DragOverlay (ở cha) + viền boxShadow khi là điểm thả hợp lệ.
export function SortableHeaderCell({
  id,
  data,
  validOver,
  colSpan,
  rowSpan,
  style,
  className,
  children,
  resizeHandle,
}: Props) {
  const { setNodeRef, attributes, listeners, isDragging } = useSortable({ id, data });
  return (
    <th
      ref={setNodeRef}
      colSpan={colSpan}
      rowSpan={rowSpan}
      {...attributes}
      {...listeners}
      style={{
        ...style,
        ...(validOver ? { boxShadow: "inset 2px 0 0 0 #3B5BDB" } : {}),
      }}
      className={[className ?? "", isDragging ? "opacity-40" : ""].join(" ")}
    >
      {children}
      {resizeHandle}
    </th>
  );
}
