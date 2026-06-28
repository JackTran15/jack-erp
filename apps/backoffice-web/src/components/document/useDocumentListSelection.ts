import { useEffect, useMemo, useState } from "react";

interface UseDocumentListSelectionProps<T> {
  rows: T[];
  getRowId: (row: T) => string;
  onAutoSelect?: (row: T) => void;
}

export function useDocumentListSelection<T>({
  rows,
  getRowId,
  onAutoSelect,
}: UseDocumentListSelectionProps<T>) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedRecord = useMemo(
    () => rows.find((row) => getRowId(row) === selectedId) ?? null,
    [getRowId, rows, selectedId],
  );

  const firstRecord = rows[0] ?? null;
  const activeRecord = selectedRecord ?? firstRecord;

  useEffect(() => {
    if (rows.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }

    if (selectedRecord) return;

    const next = rows[0];
    const nextId = getRowId(next);
    setSelectedId(nextId);
    onAutoSelect?.(next);
  }, [getRowId, onAutoSelect, rows, selectedId, selectedRecord]);

  return {
    selectedId,
    setSelectedId,
    selectedRecord,
    activeRecord,
    hasActiveRecord: activeRecord !== null,
  };
}
