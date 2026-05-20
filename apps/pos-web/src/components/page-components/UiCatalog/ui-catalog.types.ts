import type { ReactNode } from "react";

/** Nhóm phân loại các common component trên trang showcase `/ui`. */
export type CatalogCategory = "input" | "display" | "overlay" | "domain";

/** Một dòng tài liệu prop hiển thị trong bảng props của drawer. */
export interface CatalogPropDoc {
  /** Tên prop — giữ nguyên tiếng Anh. */
  name: string;
  /** Kiểu TypeScript — giữ nguyên tiếng Anh. */
  type: string;
  required: boolean;
  /** Giá trị mặc định nếu có (hiển thị dạng code). */
  defaultValue?: string;
  /** Mô tả tiếng Việt. */
  description: string;
}

/**
 * Mục dữ liệu cho một common component trên trang `/ui`: gom metadata tài liệu
 * + component live preview. Mỗi file demo export 1 entry kiểu này.
 */
export interface CatalogEntry {
  /** Slug ổn định, kebab-case (vd "pos-text-input"). */
  id: string;
  /** Tên component (vd "PosTextInput"). */
  name: string;
  category: CatalogCategory;
  /** Đường dẫn import thực tế của component. */
  importPath: string;
  /** Mô tả ngắn tiếng Việt. */
  description: string;
  props: CatalogPropDoc[];
  /** Các ghi chú cách dùng (mỗi phần tử là 1 bullet tiếng Việt). */
  usageNotes: string[];
  /** Đoạn code ví dụ (hiển thị trong CodeBlock). */
  code: string;
  /** Component live preview — render trong card (preview) và drawer (tương tác). */
  Demo: () => ReactNode;
}
