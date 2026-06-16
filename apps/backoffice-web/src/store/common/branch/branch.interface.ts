import type { STORE_TYPE } from "../../../constants/store.constant";

export interface BranchState {
  branchId: string | null;
  branchName: string | null;
  isChain: boolean;
  selectBranch: (id: string, name: string) => void;
  selectChain: () => void;
  setView: (view: STORE_TYPE) => void;
  clear: () => void;
}
