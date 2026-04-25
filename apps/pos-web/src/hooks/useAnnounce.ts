import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hook hiển thị thông báo tạm (auto-dismiss). Đảm bảo cleanup timer khi unmount.
 */
export function useAnnounce(durationMs = 3_000) {
  const [message, setMessage] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const announce = useCallback(
    (msg: string) => {
      clear();
      setMessage(msg);
      timerRef.current = setTimeout(() => {
        setMessage("");
        timerRef.current = null;
      }, durationMs);
    },
    [clear, durationMs],
  );

  useEffect(() => clear, [clear]);

  return { message, announce } as const;
}
