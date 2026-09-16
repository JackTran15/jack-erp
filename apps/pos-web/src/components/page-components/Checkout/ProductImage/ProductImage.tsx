import { useState, type ReactNode } from "react";

export interface ProductImageProps {
  /** URL công khai của ảnh; null khi bản ghi chưa có ảnh. */
  src: string | null;
  alt: string;
  className?: string;
  /** Render thay ảnh khi không có `src` hoặc ảnh tải lỗi. */
  fallback: ReactNode;
  loading?: "lazy" | "eager";
}

/**
 * Ảnh hàng hoá có fallback (card lưới catalog + header dialog chọn biến thể):
 * `src` null hoặc `<img>` bắn `error` → render `fallback`. Tải thẳng từ storage
 * bằng thẻ `<img>`, không qua `erpApi` (interceptor gắn Authorization vào mọi
 * request). Lỗi tải cố ý im lặng: ở prod trước khi bucket được mở, mọi ảnh đều
 * lỗi và log mỗi card một dòng chỉ là nhiễu.
 * Không tự reset trạng thái lỗi khi `src` đổi — chỗ gọi truyền `key={src}`.
 */
export function ProductImage({ src, alt, className, fallback, loading = "lazy" }: ProductImageProps) {
  const [failed, setFailed] = useState(false);
  if (src === null || failed) return <>{fallback}</>;
  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
