import { ChevronDownIcon } from "@erp/pos/components/icons/Icon";

export interface UserMenuProps {
  name: string;
  /** Initials override; falls back to first letter of `name`. */
  initials?: string;
  onClick?: () => void;
}

/** Avatar (blue circle with initials) + name + chevron, used in topbar. */
export function UserMenu({ name, initials, onClick }: UserMenuProps) {
  const fallback = (initials ?? name.charAt(0)).toUpperCase();
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-gray-700 transition-colors hover:bg-gray-100"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500 text-[12px] font-semibold text-white">
        {fallback}
      </span>
      <span className="font-medium">{name}</span>
      <ChevronDownIcon size={14} className="text-gray-400" />
    </button>
  );
}
