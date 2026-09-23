import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { erpApi, requireErpData } from "../../../../lib/erp-api";
import type {
  DispatchTestBody,
  DispatchTestResult,
  RunScheduledResult,
  SendRawPushBody,
  SendRawPushResult,
  TestDelivery,
  TestDevice,
  TestType,
} from "./notification-test.types";

const BASE = "/admin/notifications/test";
const DEVICES_KEY = ["notification-test", "devices"] as const;
const TYPES_KEY = ["notification-test", "types"] as const;
const DELIVERIES_KEY = ["notification-test", "deliveries"] as const;

export function useTestDevices(includeRevoked: boolean) {
  return useQuery({
    queryKey: [...DEVICES_KEY, includeRevoked],
    queryFn: async (): Promise<TestDevice[]> =>
      requireErpData(
        await erpApi.GET<TestDevice[]>(`${BASE}/devices`, {
          params: { query: { includeRevoked } },
        }),
      ),
  });
}

export function useTestTypes() {
  return useQuery({
    queryKey: TYPES_KEY,
    queryFn: async (): Promise<TestType[]> =>
      requireErpData(await erpApi.GET<TestType[]>(`${BASE}/types`)),
    // Danh mục chỉ đổi khi deploy bản backend mới.
    staleTime: 5 * 60_000,
  });
}

export function useTestDeliveries(filters: { userId?: string; type?: string }) {
  return useQuery({
    queryKey: [...DELIVERIES_KEY, filters.userId ?? "", filters.type ?? ""],
    queryFn: async (): Promise<TestDelivery[]> =>
      requireErpData(
        await erpApi.GET<TestDelivery[]>(`${BASE}/deliveries`, {
          params: {
            query: {
              limit: 50,
              ...(filters.userId ? { userId: filters.userId } : {}),
              ...(filters.type ? { type: filters.type } : {}),
            },
          },
        }),
      ),
    // Lượt gửi đi qua worker (poll 2s) nên kết quả về sau lời gọi vài giây.
    staleTime: 0,
  });
}

/** Sau mỗi lượt bắn, nhật ký phải tự làm mới — đó là chỗ đọc kết quả. */
function useInvalidateDeliveries() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: DELIVERIES_KEY });
  };
}

export function useSendRawPush() {
  const invalidate = useInvalidateDeliveries();
  return useMutation({
    mutationFn: async (body: SendRawPushBody): Promise<SendRawPushResult> =>
      requireErpData(await erpApi.POST<SendRawPushResult>(`${BASE}/push`, { body })),
    onSuccess: invalidate,
  });
}

export function useDispatchTest() {
  const invalidate = useInvalidateDeliveries();
  return useMutation({
    mutationFn: async (body: DispatchTestBody): Promise<DispatchTestResult> =>
      requireErpData(
        await erpApi.POST<DispatchTestResult>(`${BASE}/dispatch`, { body }),
      ),
    onSuccess: invalidate,
  });
}

export function useRunScheduled() {
  const invalidate = useInvalidateDeliveries();
  return useMutation({
    mutationFn: async (type: string): Promise<RunScheduledResult> =>
      requireErpData(
        await erpApi.POST<RunScheduledResult>(`${BASE}/run-scheduled`, {
          body: { type },
        }),
      ),
    onSuccess: invalidate,
  });
}
