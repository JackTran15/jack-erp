import { Link } from "react-router-dom";
import { cn } from "@erp/ui";
import type { BreadcrumbItem } from "./breadcrumbs";

interface Props {
  title?: string;
  breadcrumbs?: BreadcrumbItem[];
  className?: string;
}

export function PageHeader({ title, breadcrumbs, className }: Props) {
  const hasBreadcrumbs = breadcrumbs && breadcrumbs.length > 0;
  if (!hasBreadcrumbs && !title) return null;
  return (
    <div className={cn("shrink-0 px-2 py-0.5", className)}>
      {hasBreadcrumbs && (
        <nav
          aria-label="Điều hướng trang"
          className="mb-1 flex items-center gap-1 text-xs text-muted-foreground"
        >
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;
            const showLink = Boolean(crumb.to) && !isLast;
            return (
              <span
                key={`${crumb.label}-${index}`}
                className="flex items-center gap-1"
              >
                {index > 0 && <span>/</span>}
                {showLink && crumb.to ? (
                  <Link
                    className="hover:text-foreground hover:underline"
                    to={crumb.to}
                  >
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
      )}
      {title && <h1 className="text-xl font-semibold">{title}</h1>}
    </div>
  );
}
