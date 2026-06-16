import { useQuery } from "@tanstack/react-query";
import { organizationService } from "@erp/pos/services/organization.service";
import { ORGANIZATION_KEYS } from "@erp/pos/constants/react-query-key.constant";

/** Cấu hình POS cấp tổ chức (vd `defaultCreditDays` để prefill modal hạn nợ). */
export const useOrgPosSettings = () => {
  return useQuery({
    queryKey: ORGANIZATION_KEYS.POS_SETTINGS,
    queryFn: () => organizationService.getPosSettings(),
    staleTime: 5 * 60_000,
  });
};
