import { ChevronDown, Printer, Settings, UploadCloud } from "lucide-react";

const buttonClass =
  "flex h-[30px] items-center gap-1.5 rounded-[3px] border border-[#D9D9DE] bg-white px-2.5 text-[13px] font-medium text-[#2B3164] hover:bg-[#F5F5F6]";

export function ReportPageToolbar() {
  return (
    <div className="flex items-center gap-2">
      <button type="button" className={buttonClass}>
        <Printer className="h-4 w-4" />
        In
        <ChevronDown className="h-3 w-3" />
      </button>

      <button type="button" className={buttonClass}>
        <UploadCloud className="h-4 w-4" />
        Xuất khẩu
      </button>

      <button
        type="button"
        className="flex h-[30px] w-[30px] items-center justify-center rounded-[3px] border border-[#D9D9DE] bg-white text-[#6B6B75] hover:bg-[#F5F5F6]"
        aria-label="Thiết lập cột hiển thị"
      >
        <Settings className="h-[18px] w-[18px]" />
      </button>
    </div>
  );
}
