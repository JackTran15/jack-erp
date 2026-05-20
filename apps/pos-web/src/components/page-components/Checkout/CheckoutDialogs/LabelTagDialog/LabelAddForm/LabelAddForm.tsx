import { type KeyboardEvent } from "react";

const DEFAULT_LABEL_COLOR = "#F8D14E";

export interface LabelAddFormProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
}

export function LabelAddForm({ value, onChange, onSubmit }: LabelAddFormProps) {
  const canSave = value.trim().length > 0;

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && canSave) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div>
      <h3 className="mb-3 text-[14px] font-bold text-[#1F2937]">Thêm nhãn</h3>
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="h-5 w-5 shrink-0 rounded-full"
          style={{ backgroundColor: DEFAULT_LABEL_COLOR }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nhập tên nhãn"
          aria-label="Tên nhãn mới"
          className="flex-1 border-0 border-b border-[#E5E7EB] bg-transparent py-1 text-sm text-[#1F2937] placeholder:text-[#9CA3AF] focus:border-[#6366F1] focus:outline-none"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSave}
          className="rounded px-2 py-1 text-sm font-medium text-[#6366F1] transition-colors hover:bg-[#6366F1]/8 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        >
          Lưu lại
        </button>
      </div>
    </div>
  );
}
