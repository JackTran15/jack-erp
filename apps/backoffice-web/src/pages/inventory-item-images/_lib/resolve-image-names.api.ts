import { erpApi, requireErpData } from "../../../lib/erp-api";

/** Mirror `RESOLVE_IMAGE_NAMES_MAX` của API — mỗi lượt gọi tối đa 500 tên (A-14). */
export const RESOLVE_IMAGE_NAMES_CHUNK = 500;

export type ResolvedImageNameMatch = "product" | "orphan" | "variant";
export type ResolvedImageNameError = "SEQ_OUT_OF_RANGE" | "DUPLICATE_SEQ";

/**
 * Một tên file đã được server tách và khớp (ADR-03). Hand-typed until
 * `pnpm openapi:generate` picks the endpoint up (T-02-04); the shape mirrors
 * `resolve-image-names.dto.ts` on the API.
 */
export interface ResolvedImageName {
  /** Tên đúng như đã gửi. */
  name: string;
  /** Phần mã (đã bỏ đuôi và `(NN)`); rỗng khi tên chỉ có STT. */
  code: string;
  /** `NN` của hậu tố `(NN)`, hoặc null. */
  seq: number | null;
  match: ResolvedImageNameMatch | null;
  /** Id để gửi vào `set-images`; với biến thể là id mẫu mã cha. */
  ownerId: string | null;
  ownerCode: string | null;
  ownerName: string | null;
  error: ResolvedImageNameError | null;
}

interface ResolveImageNamesResponse {
  data: ResolvedImageName[];
}

/**
 * `POST /v2/inventory-items/resolve-image-names` cho toàn bộ `names`, tự chia
 * lô 500 và ghép kết quả theo đúng thứ tự gửi. Mảng rỗng ⇒ không gọi API.
 */
export async function resolveImageNames(names: string[]): Promise<ResolvedImageName[]> {
  const results: ResolvedImageName[] = [];
  for (let i = 0; i < names.length; i += RESOLVE_IMAGE_NAMES_CHUNK) {
    const chunk = names.slice(i, i + RESOLVE_IMAGE_NAMES_CHUNK);
    const response = requireErpData(
      await erpApi.POST<ResolveImageNamesResponse>(
        "/v2/inventory-items/resolve-image-names",
        { body: { names: chunk } },
      ),
    );
    results.push(...response.data);
  }
  return results;
}
