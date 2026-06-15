import { Calendar, Filter } from "lucide-react";

const controlClass =
  "h-[30px] rounded-[3px] border border-[#D9D9DE] bg-white px-2 text-[13px] text-[#212121] outline-none";

export function ReportPageHeaderFilter() {
  return (
    <div className="flex items-center gap-2">
      <select className={`${controlClass} w-[110px]`} defaultValue="this_month">
        <option value="this_month">Tháng này</option>
        <option value="today">Hôm nay</option>
        <option value="this_week">Tuần này</option>
        <option value="last_month">Tháng trước</option>
      </select>

      <label className="text-[13px] text-[#5C5C66]">Từ ngày</label>
      <div className={`${controlClass} flex w-[112px] items-center gap-1`}>
        <input className="w-full min-w-0 bg-transparent outline-none" value="01/06/2026" readOnly />
        <Calendar className="h-3.5 w-3.5 shrink-0 text-[#6B6B75]" />
      </div>

      <label className="text-[13px] text-[#5C5C66]">Đến ngày</label>
      <div className={`${controlClass} flex w-[112px] items-center gap-1`}>
        <input className="w-full min-w-0 bg-transparent outline-none" value="30/06/2026" readOnly />
        <Calendar className="h-3.5 w-3.5 shrink-0 text-[#6B6B75]" />
      </div>

      <button
        type="button"
        className="flex h-[30px] items-center gap-1.5 rounded-[3px] border border-[#D9D9DE] bg-white px-3 text-[13px] font-medium text-[#2B3164] hover:bg-[#F5F5F6]"
      >
        <Filter className="h-3.5 w-3.5" />
        Lấy dữ liệu
      </button>
    </div>
  );
}
