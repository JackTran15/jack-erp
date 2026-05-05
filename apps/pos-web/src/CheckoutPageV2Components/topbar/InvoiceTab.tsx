import { CloseIcon, FileTextIcon } from "../icons/Icon";
import { cx } from "../utils";

export interface InvoiceTabProps {
  label: string;
  isActive: boolean;
  /** Drafts ("HĐ lưu tạm") show a document icon and no close button. */
  isDraft?: boolean;
  onSelect: () => void;
  onClose?: () => void;
}

/**
 * A single tab inside the InvoiceTabBar. Active tab has white bg and a thin
 * indigo bottom indicator; inactive tabs sit on the gray-100 topbar bg.
 */
export function InvoiceTab({
  label,
  isActive,
  isDraft,
  onSelect,
  onClose,
}: InvoiceTabProps) {
  return (
    <div
      className={cx(
        "group relative flex h-9 items-center gap-1.5 rounded-t-md px-3 text-[14px] transition-colors",
        isActive
          ? "bg-white text-gray-900 font-medium shadow-[0_-1px_0_#E5E7EB_inset]"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200/70",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex items-center gap-1.5 outline-none"
      >
        {isDraft ? (
          <FileTextIcon size={14} className="text-gray-500" />
        ) : null}
        <span>{label}</span>
      </button>
      {!isDraft && onClose ? (
        <button
          type="button"
          aria-label={`Đóng ${label}`}
          onClick={onClose}
          className="ml-1 flex h-4 w-4 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700"
        >
          <CloseIcon size={12} />
        </button>
      ) : null}
      {isActive ? (
        <span className="pointer-events-none absolute inset-x-2 -bottom-px h-[2px] rounded bg-indigo-500" />
      ) : null}
    </div>
  );
}
