import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getActiveBranch, setActiveBranch } from "../../../lib/auth-storage";
import { STORE_TYPE } from "../../../constants/store.constant";
import type { BranchState } from "./branch.interface";


export const useBranchStore = create<BranchState>()(
  persist(
    (set) => ({
      branchId: getActiveBranch(),
      branchName: null,
      isChain: false,
      selectBranch: (id, name) => {
        setActiveBranch(id);
        set({ branchId: id, branchName: name, isChain: false });
      },
      selectChain: () => set({ isChain: true }),
      setView: (view) => set({ isChain: view === STORE_TYPE.CHAIN }),
      clear: () => set({ branchId: null, branchName: null, isChain: false }),
    }),
    {
      name: "bo-active-branch",
      partialize: (state) => ({ isChain: state.isChain }),
    },
  ),
);

export const useIsChainSelected = () => useBranchStore((s) => s.isChain);

export const useCurrentView = () =>
  useBranchStore((s) => (s.isChain ? STORE_TYPE.CHAIN : STORE_TYPE.SINGLE));
