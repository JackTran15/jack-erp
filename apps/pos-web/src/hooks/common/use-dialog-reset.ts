import { useEffect, useRef } from "react";

export function useDialogReset(open: boolean, onOpenReset: () => void) {
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      onOpenReset();
    }
    wasOpenRef.current = open;
  }, [open, onOpenReset]);
}
