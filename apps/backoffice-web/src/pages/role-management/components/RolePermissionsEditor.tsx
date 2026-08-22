import { useEffect, useMemo, useState } from "react";
import { cn } from "@erp/ui";
import { ChevronDown, ChevronRight } from "lucide-react";
import { usePermissions } from "../../../hooks/iam";
import type {
  PermissionCard,
  PermissionPage,
  PermissionSection,
} from "../permission-taxonomy";
import { buildPermissionSections } from "../permission-taxonomy";

interface RolePermissionsEditorProps {
  permissionKeys: string[];
  onChange: (permissionKeys: string[]) => void;
  readOnly?: boolean;
}

export function RolePermissionsEditor({
  permissionKeys,
  onChange,
  readOnly = false,
}: RolePermissionsEditorProps) {
  const { modules, isLoading, isError } = usePermissions();
  const sections = useMemo(() => buildPermissionSections(modules), [modules]);

  const [activePageId, setActivePageId] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<string[]>([]);

  const activePage = useMemo(
    () =>
      sections
        .flatMap((section) => section.pages)
        .find((page) => page.id === activePageId),
    [sections, activePageId],
  );

  useEffect(() => {
    if (activePage || sections.length === 0) return;
    const first = sections.find((section) => section.pages.length > 0);
    if (first) setActivePageId(first.pages[0].id);
  }, [sections, activePage]);

  const selected = useMemo(() => new Set(permissionKeys), [permissionKeys]);

  const setKeys = (keys: string[], checked: boolean) => {
    if (readOnly) return;
    if (checked) {
      onChange([...new Set([...permissionKeys, ...keys])]);
      return;
    }
    const removed = new Set(keys);
    onChange(permissionKeys.filter((key) => !removed.has(key)));
  };

  const toggleSection = (sectionId: string) =>
    setCollapsedSections((prev) =>
      prev.includes(sectionId)
        ? prev.filter((id) => id !== sectionId)
        : [...prev, sectionId],
    );

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">Đang tải danh mục quyền…</p>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Không tải được danh mục quyền. Vui lòng thử nạp lại trang.
      </p>
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-[380px] overflow-hidden rounded-md border",
        readOnly && "opacity-90",
      )}
    >
      <nav
        className="w-60 shrink-0 overflow-y-auto border-r bg-muted/30"
        aria-label="Nhóm quyền"
      >
        {sections.map((section) => (
          <SectionNav
            key={section.id}
            section={section}
            collapsed={collapsedSections.includes(section.id)}
            activePageId={activePageId}
            selected={selected}
            onToggleCollapse={() => toggleSection(section.id)}
            onSelectPage={setActivePageId}
          />
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto p-4">
        {readOnly && (
          <p className="mb-3 text-sm text-muted-foreground">
            Chế độ chỉ xem — không chỉnh quyền.
          </p>
        )}
        {activePage ? (
          <PagePanel
            page={activePage}
            selected={selected}
            readOnly={readOnly}
            onSetKeys={setKeys}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Chọn nhóm quyền.</p>
        )}
      </div>
    </div>
  );
}

function countSelected(keys: string[], selected: Set<string>) {
  return keys.filter((key) => selected.has(key)).length;
}

interface SectionNavProps {
  section: PermissionSection;
  collapsed: boolean;
  activePageId: string;
  selected: Set<string>;
  onToggleCollapse: () => void;
  onSelectPage: (pageId: string) => void;
}

function SectionNav({
  section,
  collapsed,
  activePageId,
  selected,
  onToggleCollapse,
  onSelectPage,
}: SectionNavProps) {
  const count = countSelected(section.keys, selected);
  const Chevron = collapsed ? ChevronRight : ChevronDown;

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center gap-1 px-2 py-2 text-left text-sm font-semibold text-foreground hover:bg-muted"
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
      >
        <Chevron className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">{section.label}</span>
        {count > 0 && (
          <span className="shrink-0 text-xs font-normal text-muted-foreground">
            {count}
          </span>
        )}
      </button>

      {!collapsed &&
        section.pages.map((page) => {
          const isActive = page.id === activePageId;
          const pageCount = countSelected(page.keys, selected);
          return (
            <button
              key={page.id}
              type="button"
              className={cn(
                "flex w-full items-center justify-between py-1.5 pl-7 pr-3 text-left text-sm transition-colors",
                isActive
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-foreground hover:bg-muted",
              )}
              onClick={() => onSelectPage(page.id)}
            >
              <span className="truncate">{page.label}</span>
              <span className="ml-1 shrink-0 text-xs text-muted-foreground">
                {pageCount}/{page.keys.length}
              </span>
            </button>
          );
        })}
    </div>
  );
}

interface PagePanelProps {
  page: PermissionPage;
  selected: Set<string>;
  readOnly: boolean;
  onSetKeys: (keys: string[], checked: boolean) => void;
}

function PagePanel({ page, selected, readOnly, onSetKeys }: PagePanelProps) {
  const count = countSelected(page.keys, selected);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b pb-2">
        <TriStateCheckbox
          label={page.label}
          total={page.keys.length}
          selectedCount={count}
          readOnly={readOnly}
          className="text-sm font-semibold"
          onToggle={(checked) => onSetKeys(page.keys, checked)}
        />
        <span className="text-xs text-muted-foreground">
          Đã chọn {count}/{page.keys.length}
        </span>
      </div>

      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
        {page.cards.map((card) => (
          <CardBlock
            key={card.id}
            card={card}
            selected={selected}
            readOnly={readOnly}
            onSetKeys={onSetKeys}
          />
        ))}
      </div>
    </div>
  );
}

interface CardBlockProps {
  card: PermissionCard;
  selected: Set<string>;
  readOnly: boolean;
  onSetKeys: (keys: string[], checked: boolean) => void;
}

function CardBlock({ card, selected, readOnly, onSetKeys }: CardBlockProps) {
  const keys = card.items.map((item) => item.key);
  const count = countSelected(keys, selected);

  return (
    <div className="space-y-2">
      <TriStateCheckbox
        label={card.label}
        total={keys.length}
        selectedCount={count}
        readOnly={readOnly}
        className="text-sm font-semibold"
        onToggle={(checked) => onSetKeys(keys, checked)}
      />
      <div className="space-y-1.5 pl-6">
        {card.items.map((item) => (
          <label
            key={item.key}
            title={item.fullLabel}
            className={cn(
              "flex items-start gap-2 text-sm",
              readOnly ? "cursor-default" : "cursor-pointer",
            )}
          >
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-input"
              checked={selected.has(item.key)}
              disabled={readOnly}
              onChange={(e) => onSetKeys([item.key], e.target.checked)}
            />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

interface TriStateCheckboxProps {
  label: string;
  total: number;
  selectedCount: number;
  readOnly: boolean;
  className?: string;
  onToggle: (checked: boolean) => void;
}

function TriStateCheckbox({
  label,
  total,
  selectedCount,
  readOnly,
  className,
  onToggle,
}: TriStateCheckboxProps) {
  const all = total > 0 && selectedCount === total;
  const some = !all && selectedCount > 0;

  return (
    <label
      className={cn(
        "flex items-center gap-2",
        readOnly ? "cursor-default" : "cursor-pointer",
        className,
      )}
    >
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-input"
        checked={all}
        disabled={readOnly}
        ref={(el) => {
          if (el) el.indeterminate = some;
        }}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
