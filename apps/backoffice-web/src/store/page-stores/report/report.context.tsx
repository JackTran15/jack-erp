import { createContext, useContext, useRef, type ReactNode } from "react";
import { useStore } from "zustand";
import { createReportStore, type ReportStoreApi } from "./report.store";
import type { ReportInitialState, ReportState } from "./report.interface";

const ReportStoreContext = createContext<ReportStoreApi | null>(null);

interface ReportStoreProviderProps {
  initialState: ReportInitialState;
  children: ReactNode;
}

// Provider per-page: mỗi trang report có một store instance riêng (không global).
// Remount (đổi key ở ReportPage) -> store reset về mặc định.
export function ReportStoreProvider({
  initialState,
  children,
}: ReportStoreProviderProps) {
  const storeRef = useRef<ReportStoreApi | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createReportStore(initialState);
  }
  return (
    <ReportStoreContext.Provider value={storeRef.current}>
      {children}
    </ReportStoreContext.Provider>
  );
}

export function useReportStore<T>(selector: (state: ReportState) => T): T {
  const store = useContext(ReportStoreContext);
  if (!store) {
    throw new Error("useReportStore must be used within a ReportStoreProvider");
  }
  return useStore(store, selector);
}
