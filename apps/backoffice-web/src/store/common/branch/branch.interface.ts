export interface BranchState {
  branchId: string | null;
  branchName: string | null;
  isChain: boolean;
  selectBranch: (id: string, name: string) => void;
  selectChain: () => void;
  clear: () => void;
}
