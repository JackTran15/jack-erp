import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getActiveBranch, setActiveBranch } from "../../../lib/auth-storage";
import { STORE_TYPE } from "../../../constants/store.constant";
import { canViewChain } from "../../../lib/permissions";
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

/**
 * `isChain` is persisted in localStorage, so a user who never had (or just lost)
 * the consolidated-reports permission could otherwise stay stuck in the chain view.
 * Both selectors fall back to the single-branch view when the permission is absent.
 */
export const useIsChainSelected = () =>
  useBranchStore((s) => s.isChain && canViewChain());

export const useCurrentView = () =>
  useBranchStore((s) =>
    s.isChain && canViewChain() ? STORE_TYPE.CHAIN : STORE_TYPE.SINGLE,
  );
