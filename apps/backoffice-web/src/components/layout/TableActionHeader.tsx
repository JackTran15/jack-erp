import { Link } from "react-router-dom";
import type { ToolbarItem } from "@erp/ui";
import { PageToolbar } from "@erp/ui";
import type { BreadcrumbItem } from "./breadcrumbs";

interface TableActionHeaderProps {
  breadcrumbs: BreadcrumbItem[];
  items: ToolbarItem[];
  className?: string;
}

/**
 * Shared header for table pages:
 * - breadcrumb line at the top
 */
export function TableActionHeader({
  breadcrumbs,
  items,
  className,
}: TableActionHeaderProps) {
  return (
    <div className={className}>
      <nav
        aria-label="Điều hướng trang"
        className="mb-2 flex items-center gap-1 text-xs text-muted-foreground"
      >
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          const href = crumb.to;
          const showLink = Boolean(href) && !isLast;
          return (
            <span key={`${crumb.label}-${index}`} className="flex items-center gap-1">
              {index > 0 ? <span>/</span> : null}
              {showLink && href ? (
                <Link className="hover:text-foreground hover:underline" to={href}>
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className={isLast ? "font-semibold text-foreground" : ""}
                >
                  {crumb.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>

      <PageToolbar tone="misa" items={items} />
    </div>
  );
}
