import { cn } from "@erp/ui";
import type { CatalogPropDoc } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

export interface PropsTableProps {
  props: CatalogPropDoc[];
}

/** Bảng tài liệu props: Prop | Kiểu | Bắt buộc | Mặc định | Mô tả. */
export const PropsTable = ({ props }: PropsTableProps) => {
  if (props.length === 0) {
    return (
      <p className="text-[13px] text-gray-500">Component này không nhận props.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full border-collapse text-left text-[13px]">
        <thead className="bg-[#F3F4F6] text-gray-700">
          <tr>
            <th className="px-3 py-2 font-semibold">Prop</th>
            <th className="px-3 py-2 font-semibold">Kiểu</th>
            <th className="px-3 py-2 font-semibold whitespace-nowrap">Bắt buộc</th>
            <th className="px-3 py-2 font-semibold whitespace-nowrap">Mặc định</th>
            <th className="px-3 py-2 font-semibold">Mô tả</th>
          </tr>
        </thead>
        <tbody>
          {props.map((p) => (
            <tr key={p.name} className="border-t border-gray-100 align-top">
              <td className="px-3 py-2 font-mono text-[12.5px] font-medium text-[#4F46E5]">
                {p.name}
              </td>
              <td className="px-3 py-2 font-mono text-[12px] text-gray-600">
                {p.type}
              </td>
              <td className="px-3 py-2">
                <span
                  className={cn(
                    "inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium",
                    p.required
                      ? "bg-[#FEE2E2] text-[#B91C1C]"
                      : "bg-gray-100 text-gray-500",
                  )}
                >
                  {p.required ? "Bắt buộc" : "Tuỳ chọn"}
                </span>
              </td>
              <td className="px-3 py-2 font-mono text-[12px] text-gray-500">
                {p.defaultValue ?? "—"}
              </td>
              <td className="px-3 py-2 text-gray-700">{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
