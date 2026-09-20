import { useEffect, useState } from "react";

/**
 * Trễ giá trị lại một nhịp. Dùng cho hàng filter của lưới: ô input giữ giá trị
 * tức thời (không khựng khi gõ), còn queryKey chỉ đổi sau khi người dùng ngừng.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
