import { useCallback, useState } from "react";

interface UseControllableStateParams<T> {
  value?: T;
  defaultValue: T;
  onChange?: (next: T) => void;
}

export function useControllableState<T>({
  value,
  defaultValue,
  onChange,
}: UseControllableStateParams<T>) {
  const [internalValue, setInternalValue] = useState<T>(defaultValue);
  const isControlled = value !== undefined;
  const currentValue = isControlled ? value : internalValue;

  const setValue = useCallback(
    (next: T) => {
      if (!isControlled) {
        setInternalValue(next);
      }
      onChange?.(next);
    },
    [isControlled, onChange],
  );

  const reset = useCallback(
    (next: T) => {
      setInternalValue(next);
    },
    [],
  );

  return { value: currentValue, setValue, reset, isControlled } as const;
}
