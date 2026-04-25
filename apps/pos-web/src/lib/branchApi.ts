import { http } from "./http";

export type BranchRow = {
  id: string;
  name: string;
};

export async function getBranchById(id: string): Promise<BranchRow> {
  return http.get<BranchRow>(`/branches/${id}`);
}
