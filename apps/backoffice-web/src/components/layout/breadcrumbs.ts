import { activeModuleFor, navConfig } from "./navConfig";

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

export function resolveBackofficeBreadcrumbs(
  pathname: string,
  append: BreadcrumbItem[] = [],
): BreadcrumbItem[] {
  const module = activeModuleFor(pathname, navConfig);
  if (!module) {
    return append;
  }

  const moduleCrumb: BreadcrumbItem = {
    label: module.label,
    to: module.defaultPath,
  };

  const matchingChild = module.sections
    .flatMap((section) => section.children)
    .filter((child) => {
      if (child.end) return pathname === child.to;
      return pathname === child.to || pathname.startsWith(`${child.to}/`);
    })
    .sort((a, b) => b.to.length - a.to.length)[0];

  const childCrumb: BreadcrumbItem | null = matchingChild
    ? { label: matchingChild.label, to: matchingChild.to }
    : null;

  return [moduleCrumb, ...(childCrumb ? [childCrumb] : []), ...append];
}
