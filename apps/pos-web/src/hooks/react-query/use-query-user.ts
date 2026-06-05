import { useQuery } from "@tanstack/react-query";
import { userService } from "@erp/pos/services/user.service";
import { USER_KEYS } from "@erp/pos/constants/react-query-key.constant";

export const useCurrentUserQuery = () =>
  useQuery({
    queryKey: USER_KEYS.ME,
    queryFn: () => userService.getMe(),
    staleTime: 10 * 60_000,
  });
