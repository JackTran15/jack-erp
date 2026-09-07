import type { TempWarehousePublicUser } from "@erp/shared-interfaces";

import { formatCarrierName } from "./temp-warehouse-mappers";

const normalize = (value: string | null | undefined): string =>
  (value ?? "").trim().toLowerCase();

/**
 * Người vận chuyển mà phím Enter được phép tự chọn, khi ô nhập không còn dòng
 * nào đang nổi. Chỉ trả về khi ý định đã rõ:
 *
 * - Chuỗi trùng khít mã nhân viên / tên / email của một dòng — kể cả khi danh
 *   sách còn nhiều dòng, vì "NV1" vẫn kéo theo "NV10", "NV11".
 * - Không trùng khít nhưng cả danh sách chỉ còn đúng một dòng.
 *
 * Còn lại trả `null`: nhiều ứng viên mà tự chọn hộ là gán nhầm người vận chuyển
 * cho dòng hàng, và không có gì trên màn hình báo là đã chọn sai.
 */
export function resolveCarrierForQuery(
  query: string,
  candidates: TempWarehousePublicUser[],
): TempWarehousePublicUser | null {
  const q = normalize(query);
  if (!q) return null;

  const exact = candidates.find(
    (c) =>
      normalize(c.employeeCode) === q ||
      normalize(formatCarrierName(c)) === q ||
      normalize(c.email) === q,
  );
  if (exact) return exact;

  return candidates.length === 1 ? candidates[0]! : null;
}
