import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PosBranchState {
  branchId: string | null;
  branchName: string | null;
  setBranch: (id: string, name: string) => void;
  clearBranch: () => void;
}

export const usePosBranchStore = create<PosBranchState>()(
  persist(
    (set) => ({
      branchId: null,
      branchName: null,
      setBranch: (id, name) => set({ branchId: id, branchName: name }),
      clearBranch: () => set({ branchId: null, branchName: null }),
    }),
    {
      name: "pos-branch",
      partialize: (state) => ({
        branchId: state.branchId,
      }),
    },
  ),
);
