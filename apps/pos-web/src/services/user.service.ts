import { http } from "@erp/pos/lib/common/http";
import type { UserRow } from "@erp/pos/interfaces/user.interface";

export const userService = {
  getMe: (): Promise<UserRow> => http.get<UserRow>("/admin/users/me"),
};
