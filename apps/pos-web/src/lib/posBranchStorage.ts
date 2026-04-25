const KEY_ID = "pos_active_branch_id";
const KEY_NAME = "pos_active_branch_name";

export function getPosBranchId(): string | null {
  return localStorage.getItem(KEY_ID);
}

export function getPosBranchName(): string | null {
  return localStorage.getItem(KEY_NAME);
}

export function setPosBranch(id: string, name: string): void {
  localStorage.setItem(KEY_ID, id);
  localStorage.setItem(KEY_NAME, name);
}

export function clearPosBranch(): void {
  localStorage.removeItem(KEY_ID);
  localStorage.removeItem(KEY_NAME);
}
