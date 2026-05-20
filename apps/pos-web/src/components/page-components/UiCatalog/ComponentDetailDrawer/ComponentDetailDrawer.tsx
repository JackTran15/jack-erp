import { cn } from "@erp/ui";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";
import { CATEGORY_LABELS } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.registry";
import { PropsTable } from "@erp/pos/components/page-components/UiCatalog/PropsTable/PropsTable";
import { CodeBlock } from "@erp/pos/components/page-components/UiCatalog/CodeBlock/CodeBlock";

export interface ComponentDetailDrawerProps {
  /** Entry đang xem; null = drawer đóng. */
  entry: CatalogEntry | null;
  onClose: () => void;
}

const SECTION_TITLE =
  "mb-2 text-[12px] font-semibold uppercase tracking-wide text-gray-400";

/** Drawer trượt từ phải, hiển thị chi tiết một common component. */
export const ComponentDetailDrawer = ({
  entry,
  onClose,
}: ComponentDetailDrawerProps) => {
  const open = entry !== null;
  // Giữ lại entry cuối để nội dung không biến mất giữa lúc trượt đóng.
  const [displayed, setDisplayed] = useState<CatalogEntry | null>(entry);

  useEffect(() => {
    if (entry) setDisplayed(entry);
  }, [entry]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const Demo = displayed?.Demo;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[1000]",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
      aria-hidden={!open}
    >
      <div
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-black/30 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0",
        )}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={displayed ? `Chi tiết ${displayed.name}` : undefined}
        className={cn(
          "absolute right-0 top-0 flex h-full w-[65dvw] flex-col bg-white shadow-[-8px_0_32px_rgba(15,23,42,0.12)] transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {displayed ? (
          <>
            <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-6 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-[18px] font-semibold text-gray-900">
                    {displayed.name}
                  </h2>
                  <span className="shrink-0 rounded-full bg-[#e8f0fe] px-2 py-0.5 text-[11px] font-medium text-[#1a73e8]">
                    {CATEGORY_LABELS[displayed.category]}
                  </span>
                </div>
                <code className="mt-1 block truncate font-mono text-[12px] text-gray-400">
                  {displayed.importPath}
                </code>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng"
                className="shrink-0 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                <CloseIcon size={20} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="mb-6">
                <h3 className={SECTION_TITLE}>Mô tả</h3>
                <p className="text-[14px] leading-relaxed text-gray-700">
                  {displayed.description}
                </p>
              </div>

              <div className="mb-6">
                <h3 className={SECTION_TITLE}>Xem trực tiếp</h3>
                <div className="flex min-h-[88px] items-center justify-center rounded-lg border border-gray-200 bg-[#f7f8fa] p-5">
                  {Demo ? <Demo /> : null}
                </div>
              </div>

              <div className="mb-6">
                <h3 className={SECTION_TITLE}>Props</h3>
                <PropsTable props={displayed.props} />
              </div>

              {displayed.usageNotes.length > 0 ? (
                <div className="mb-6">
                  <h3 className={SECTION_TITLE}>Cách dùng</h3>
                  <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-gray-700">
                    {displayed.usageNotes.map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div>
                <h3 className={SECTION_TITLE}>Ví dụ</h3>
                <CodeBlock code={displayed.code} />
              </div>
            </div>
          </>
        ) : null}
      </aside>
    </div>,
    document.body,
  );
};
