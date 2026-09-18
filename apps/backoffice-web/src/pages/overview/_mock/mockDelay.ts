/**
 * Độ trễ giả cho mọi query mock, để các trạng thái loading/refetch của widget
 * hoạt động đúng như khi nối API thật.
 */
export const MOCK_LATENCY_MS = 250;

export function mockDelay<T>(value: T, ms = MOCK_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}
