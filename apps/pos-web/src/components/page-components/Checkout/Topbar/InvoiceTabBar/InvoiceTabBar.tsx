import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PosIconButton } from "@erp/pos/components/common/PosIconButton/PosIconButton";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
} from "@erp/pos/components/common/PosIcons/PosIcons";
import { InvoiceTab } from "@erp/pos/components/page-components/Checkout/Topbar/InvoiceTab/InvoiceTab";
import type { InvoiceTabItem } from "@erp/pos/lib/page-libs/checkout/checkout.types";

export interface InvoiceTabBarProps {
  tabs: ReadonlyArray<InvoiceTabItem>;
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
}

const SCROLL_STEP = 220;
const ARROW_DISABLED_CLASS =
  "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-500";

/**
 * Topbar invoice strip. Only the regular invoice tabs scroll horizontally,
 * flanked by left/right chevron arrows when they overflow. The draft tab
 * ("HĐ lưu tạm") and the `+` (new invoice) button stay anchored at the far
 * right so they remain reachable no matter how many invoices are open.
 */
export function InvoiceTabBar({
  tabs,
  activeId,
  onSelect,
  onClose,
  onAdd,
}: InvoiceTabBarProps) {
  const { invoiceTabs, draftTab } = useMemo(() => {
    const invoiceTabs: InvoiceTabItem[] = [];
    let draftTab: InvoiceTabItem | undefined;
    for (const tab of tabs) {
      if (tab.isDraft) draftTab = tab;
      else invoiceTabs.push(tab);
    }
    return { invoiceTabs, draftTab };
  }, [tabs]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const { scrollLeft, scrollWidth, clientWidth } = el;
    // 1px tolerance to avoid flicker at exact boundaries.
    setCanScrollLeft(scrollLeft > 1);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
  }, []);

  useLayoutEffect(() => {
    updateScrollState();
  }, [invoiceTabs, updateScrollState]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    window.addEventListener("resize", updateScrollState);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateScrollState);
    };
  }, [updateScrollState]);

  useEffect(() => {
    const node = tabRefs.current[activeId];
    if (!node) return;
    node.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [activeId]);

  const scrollBy = (offset: number) => {
    scrollRef.current?.scrollBy({ left: offset, behavior: "smooth" });
  };

  const showArrows = canScrollLeft || canScrollRight;

  return (
    <nav
      aria-label="Hóa đơn"
      className="flex min-w-0 flex-1 items-end gap-1 self-end pl-2"
    >
      {showArrows ? (
        <PosIconButton
          ariaLabel="Cuộn sang trái"
          icon={<ChevronLeftIcon size={16} />}
          onClick={() => scrollBy(-SCROLL_STEP)}
          disabled={!canScrollLeft}
          className={`mb-1 ${ARROW_DISABLED_CLASS}`}
        />
      ) : null}
      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        className="flex min-w-0 items-end gap-0.5 overflow-x-auto [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {invoiceTabs.map((tab) => (
          <div
            key={tab.id}
            ref={(node) => {
              tabRefs.current[tab.id] = node;
            }}
            className="shrink-0"
          >
            <InvoiceTab
              label={tab.label}
              isActive={tab.id === activeId}
              badgeCount={tab.badgeCount}
              onSelect={() => onSelect(tab.id)}
              onClose={() => onClose(tab.id)}
            />
          </div>
        ))}
      </div>
      {showArrows ? (
        <PosIconButton
          ariaLabel="Cuộn sang phải"
          icon={<ChevronRightIcon size={16} />}
          onClick={() => scrollBy(SCROLL_STEP)}
          disabled={!canScrollRight}
          className={`mb-1 ${ARROW_DISABLED_CLASS}`}
        />
      ) : null}
      <PosIconButton
        ariaLabel="Thêm hóa đơn"
        icon={<PlusIcon size={16} />}
        onClick={onAdd}
        className="mb-1 shrink-0"
      />
      {draftTab ? (
        <div
          ref={(node) => {
            tabRefs.current[draftTab.id] = node;
          }}
          className="shrink-0"
        >
          <InvoiceTab
            label={draftTab.label}
            isActive={draftTab.id === activeId}
            isDraft
            badgeCount={draftTab.badgeCount}
            onSelect={() => onSelect(draftTab.id)}
          />
        </div>
      ) : null}
    </nav>
  );
}
