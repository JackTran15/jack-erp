import { formatVnd } from "@erp/ui";
import type { AppliedProgram } from "@erp/shared-interfaces";
import { PromotionProgramType } from "@erp/shared-interfaces";

/**
 * Trục "dòng ↔ CTKM" dùng chung cho màn hình bán, hóa đơn in và hóa đơn đã lưu
 * (ADR-01 của `2026091804-pos-line-promotion-breakdown`).
 *
 * Nhận `appliedPrograms` từ bất kỳ nguồn nào có cùng shape — preview
 * `POST /v2/promotions/evaluate` (lineId = id dòng client, engine echo lại) hay
 * snapshot `invoice_checkout_promotions` qua `GET /invoices/:id` (lineId =
 * `invoice_items.id`). Hàm không biết nguồn; người gọi đưa đúng tập id.
 *
 * Chia hai nhóm, và đây là chỗ DUY NHẤT giữ danh sách (A-02):
 *   - `item`    — ba loại engine chạy ở pha giành dòng (`LINE_CLAIMING_TYPES`
 *                 trong promotion-resolver.ts). Trừ vào Thành tiền của dòng.
 *   - `invoice` — INVOICE_DISCOUNT phân bổ xuống dòng. Chỉ là nhãn dưới tên;
 *                 KHÔNG trừ vào Thành tiền — nó đã nằm ở dòng "Khuyến mại" của
 *                 panel phải, trừ thêm là trừ hai lần (ADR-02, A-01).
 *   GIFT_ITEM bị bỏ: discountAmount luôn 0, quà đã có dòng riêng.
 */
export type LinePromotionBucket = "item" | "invoice";

export interface LinePromotion {
  programId: string;
  code: string;
  name: string;
  type: PromotionProgramType;
  discountAmount: number;
  unitPriceAfter: number;
  bucket: LinePromotionBucket;
}

export type AppliedProgramLike = Pick<
  AppliedProgram,
  "programId" | "code" | "name" | "type" | "discountAmount" | "lineDiscounts"
>;

export interface LinePromotionIndex {
  byLine: Map<string, LinePromotion[]>;
  /**
   * Cộng theo `program.discountAmount` (không cộng lại từ `lineDiscounts`) để
   * luôn khớp `promotionDiscount` server trả — kể cả khi một lineId không khớp
   * dòng nào và bị bỏ khỏi `byLine`.
   */
  totals: Record<LinePromotionBucket, number>;
}

const ITEM_BUCKET_TYPES: ReadonlySet<PromotionProgramType> = new Set([
  PromotionProgramType.ITEM_DISCOUNT,
  PromotionProgramType.TIERED_DISCOUNT,
  PromotionProgramType.BUY_M_GET_N,
]);

const EMPTY_INDEX: LinePromotionIndex = {
  byLine: new Map(),
  totals: { item: 0, invoice: 0 },
};

/** Đã cảnh báo cặp programId:lineId nào rồi — mỗi cặp một lần, không spam console. */
const warnedUnknownLines = new Set<string>();

export function bucketOf(type: PromotionProgramType): LinePromotionBucket | null {
  if (type === PromotionProgramType.GIFT_ITEM) return null;
  return ITEM_BUCKET_TYPES.has(type) ? "item" : "invoice";
}

export function buildLinePromotionIndex(
  programs: readonly AppliedProgramLike[],
  knownLineIds?: ReadonlySet<string>,
): LinePromotionIndex {
  if (programs.length === 0) return EMPTY_INDEX;

  const byLine = new Map<string, LinePromotion[]>();
  const totals: Record<LinePromotionBucket, number> = { item: 0, invoice: 0 };

  for (const program of programs) {
    const bucket = bucketOf(program.type);
    if (!bucket) continue;
    totals[bucket] += program.discountAmount;

    for (const ld of program.lineDiscounts ?? []) {
      if (knownLineIds && !knownLineIds.has(ld.lineId)) {
        const key = `${program.programId}:${ld.lineId}`;
        if (!warnedUnknownLines.has(key)) {
          warnedUnknownLines.add(key);
          // eslint-disable-next-line no-console
          console.warn("[promotion] lineDiscount không khớp dòng nào", {
            programId: program.programId,
            lineId: ld.lineId,
          });
        }
        continue;
      }
      const list = byLine.get(ld.lineId) ?? [];
      list.push({
        programId: program.programId,
        code: program.code,
        name: program.name,
        type: program.type,
        discountAmount: ld.discountAmount,
        unitPriceAfter: ld.unitPriceAfter,
        bucket,
      });
      byLine.set(ld.lineId, list);
    }
  }

  return { byLine, totals };
}

/** Tổng phần `item` của một dòng — phần được trừ vào Thành tiền (ADR-02). */
export function itemDiscountOfLine(index: LinePromotionIndex, lineId: string): number {
  return (index.byLine.get(lineId) ?? []).reduce(
    (sum, p) => (p.bucket === "item" ? sum + p.discountAmount : sum),
    0,
  );
}

/** Nhãn dưới tên hàng, cùng kiểu với nhãn giảm giá tay: "Tên CTKM (68.500)". */
export function formatPromotionLabel(p: LinePromotion): string {
  return `${p.name} (${formatVnd(p.discountAmount)})`;
}
