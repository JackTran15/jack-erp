import type { DraftInvoice } from "./checkout.types";
import { buildZigzagClipPath } from "./draftInvoices.types";

export const DRAFT_ZIGZAG_CLIP_PATH = buildZigzagClipPath(40, 6);

export function draftLineDescription(line: Pick<DraftInvoice["lines"][number], "code" | "name">): string {
  const includesCode = line.code && line.name.includes(line.code);
  return includesCode ? line.name : `${line.name} ${line.code}`.trim();
}
