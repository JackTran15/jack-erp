import { http } from "@erp/pos/lib/common/http";
import type { PosSettingsResponse } from "@erp/pos/dtos/organization.dto";

export const organizationService = {
  /** Cấu hình POS cấp tổ chức hiện tại (BE scope theo org của token). */
  getPosSettings: (): Promise<PosSettingsResponse> => {
    return http.get<PosSettingsResponse>(`/organizations/current/pos-settings`);
  },
};
