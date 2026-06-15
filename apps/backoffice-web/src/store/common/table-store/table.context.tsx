import { createContext, useContext, useRef, type ReactNode } from "react";
import { useStore } from "zustand";
import { createTableStore, type TableStoreApi } from "./table.store";
import type { TableInitialState, TableState } from "./table.interface";

const TableStoreContext = createContext<TableStoreApi | null>(null);

interface TableStoreProviderProps {
  initialState: TableInitialState;
  children: ReactNode;
}

// Provider per-table: mỗi table có một store instance riêng → không xung đột state giữa các table.
export function TableStoreProvider({ initialState, children }: TableStoreProviderProps) {
  const storeRef = useRef<TableStoreApi | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createTableStore(initialState);
  }
  return (
    <TableStoreContext.Provider value={storeRef.current}>{children}</TableStoreContext.Provider>
  );
}

export function useTableStore<T>(selector: (state: TableState) => T): T {
  const store = useContext(TableStoreContext);
  if (!store) {
    throw new Error("useTableStore must be used within a TableStoreProvider");
  }
  return useStore(store, selector);
}
