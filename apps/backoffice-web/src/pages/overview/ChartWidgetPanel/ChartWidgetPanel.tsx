import type { ReactNode } from "react";
import { formatViDateTimeShort } from "../_lib/format";
import { WidgetHeader } from "./WidgetHeader/WidgetHeader";

interface Props {
  title: ReactNode;
  periodSelect: ReactNode;
  onOpenOptions: () => void;
  onRefresh: () => void;
  refreshing?: boolean;
  /** Thời điểm dữ liệu, hiện ở footer "Dữ liệu: …". */
  updatedAt?: Date;
  /** Nội dung chèn giữa header và body (vd thanh "Sắp xếp theo"). */
  toolbar?: ReactNode;
  children: ReactNode;
  /** Modal "Tùy chọn" của widget. */
  modal?: ReactNode;
}

/** Vỏ panel trắng dùng chung cho 4 widget của row 2 và row 3. */
export function ChartWidgetPanel({
  title,
  periodSelect,
  onOpenOptions,
  onRefresh,
  refreshing,
  updatedAt,
  toolbar,
  children,
  modal,
}: Props) {
  return (
    <section className="flex min-w-0 flex-col rounded bg-white">
      <WidgetHeader
        title={title}
        periodSelect={periodSelect}
        onOpenOptions={onOpenOptions}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-3 pt-4">
        {toolbar}
        <div className="min-h-0 flex-1">{children}</div>
        <p className="mt-6 text-xs leading-4 text-[#616161]">
          Dữ liệu: {updatedAt ? formatViDateTimeShort(updatedAt) : "—"}
        </p>
      </div>
      {modal}
    </section>
  );
}
