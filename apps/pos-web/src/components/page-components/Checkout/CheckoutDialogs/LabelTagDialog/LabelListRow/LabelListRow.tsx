import { type KeyboardEvent } from "react";
import { PosCheckbox } from "@erp/pos/components/common/PosCheckbox/PosCheckbox";
import { PosIconButton } from "@erp/pos/components/common/PosIconButton/PosIconButton";
import {
  CloseIcon,
  PencilIcon,
} from "@erp/pos/components/common/PosIcons/PosIcons";
import type { LabelTag } from "@erp/pos/stores/page-stores/checkout/checkout-labels.store";

export interface LabelListRowProps {
  label: LabelTag;
  checked: boolean;
  onToggle: () => void;
  editing: boolean;
  editingName: string;
  onEditStart: () => void;
  onEditChange: (next: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onDelete: () => void;
}

export function LabelListRow({
  label,
  checked,
  onToggle,
  editing,
  editingName,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onDelete,
}: LabelListRowProps) {
  const handleEditKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && editingName.trim().length > 0) {
      e.preventDefault();
      onEditSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onEditCancel();
    }
  };

  return (
    <li className="flex items-center gap-3 rounded px-1 py-2 hover:bg-gray-50">
      <PosCheckbox
        checked={checked}
        onChange={onToggle}
        ariaLabel={`Chọn nhãn ${label.name}`}
      />
      <span
        aria-hidden
        className="h-5 w-5 shrink-0 rounded-full"
        style={{ backgroundColor: label.color }}
      />
      {editing ? (
        <>
          <input
            type="text"
            value={editingName}
            onChange={(e) => onEditChange(e.target.value)}
            onKeyDown={handleEditKeyDown}
            autoFocus
            aria-label={`Sửa tên nhãn ${label.name}`}
            className="flex-1 min-w-0 border-0 border-b border-[#E5E7EB] bg-transparent py-1 text-sm text-[#1F2937] focus:border-[#6366F1] focus:outline-none"
          />
          <button
            type="button"
            onClick={onEditSave}
            disabled={editingName.trim().length === 0}
            className="rounded px-2 py-1 text-sm font-medium text-[#6366F1] hover:bg-[#6366F1]/8 disabled:opacity-50"
          >
            Lưu
          </button>
          <button
            type="button"
            onClick={onEditCancel}
            className="rounded px-2 py-1 text-sm font-medium text-gray-500 hover:bg-gray-100"
          >
            Hủy
          </button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate text-sm text-[#1F2937]">
            {label.name}
          </span>
          <PosIconButton
            ariaLabel={`Sửa nhãn ${label.name}`}
            icon={<PencilIcon size={16} />}
            onClick={onEditStart}
            className="text-[#6366F1] hover:bg-[#6366F1]/10 hover:text-[#4F46E5]"
          />
          <PosIconButton
            ariaLabel={`Xoá nhãn ${label.name}`}
            icon={<CloseIcon size={16} />}
            onClick={onDelete}
            className="text-[#EF4444] hover:bg-[#EF4444]/10 hover:text-[#DC2626]"
          />
        </>
      )}
    </li>
  );
}
