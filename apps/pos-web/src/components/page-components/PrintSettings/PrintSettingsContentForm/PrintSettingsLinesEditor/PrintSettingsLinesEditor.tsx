import { PlusIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { PrintSettingsLineRow } from "@erp/pos/components/page-components/PrintSettings/PrintSettingsContentForm/PrintSettingsLinesEditor/PrintSettingsLineRow/PrintSettingsLineRow";
import type { SampleInvoiceLine } from "@erp/pos/interfaces/print-sample-invoice.interface";

export interface PrintSettingsLinesEditorProps {
  lines: SampleInvoiceLine[];
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<Omit<SampleInvoiceLine, "id">>) => void;
  onRemove: (id: string) => void;
}

/**
 * Bảng hàng hóa của hóa đơn mẫu. Số thứ tự in ra bill luôn đánh lại theo vị
 * trí, nên thêm/xóa dòng không bao giờ làm cột "#" bị nhảy số.
 */
export function PrintSettingsLinesEditor({
  lines,
  onAdd,
  onUpdate,
  onRemove,
}: PrintSettingsLinesEditorProps) {
  return (
    <div className="flex flex-col gap-2">
      {lines.map((line, index) => (
        <PrintSettingsLineRow
          key={line.id}
          line={line}
          index={index + 1}
          onChange={(patch) => onUpdate(line.id, patch)}
          onRemove={() => onRemove(line.id)}
          canRemove={lines.length > 1}
        />
      ))}

      <button
        type="button"
        onClick={onAdd}
        className="inline-flex h-9 items-center justify-center gap-1.5 self-start rounded-md border border-dashed border-gray-300 px-3 text-sm font-medium text-gray-700 hover:border-[#5B5BD6] hover:text-[#5B5BD6]"
      >
        <PlusIcon size={14} />
        Thêm hàng hóa
      </button>
    </div>
  );
}
