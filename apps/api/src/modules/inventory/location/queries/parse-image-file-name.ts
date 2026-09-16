/**
 * `SKU (NN)` file-name rule of the quick image update page (ADR-03, A-08).
 * Pure function, no Nest imports — the regex and its edge cases are proven
 * by `parse-image-file-name.spec.ts`.
 */

export type ImageFileNameError = 'SEQ_OUT_OF_RANGE';

export interface ParsedImageFileName {
  /** Everything before the `(NN)` suffix, trimmed; `''` when nothing is left. */
  code: string;
  /** The `NN` of a `(NN)` suffix, or null when the name has none. */
  seq: number | null;
  /** Set when `seq` is outside 1..10; `code` is still returned for display. */
  error: ImageFileNameError | null;
}

const IMAGE_EXTENSION = /\.(jpe?g|png|gif|webp)$/i;
const SEQ_SUFFIX = /^(.*?)\s*\((\d{1,2})\)$/;
const SEQ_MIN = 1;
const SEQ_MAX = 10;

/**
 * 1. Drop an image extension (case-insensitive) and trim.
 * 2. `^(.*?)\s*\((\d{1,2})\)$` → `code` = group 1 trimmed, `seq` = group 2.
 *    Only the final `(NN)` is the sequence, so `ABC (1) (2)` is code `ABC (1)`.
 *    No match → `code` = whole name, `seq` = null.
 */
export function parseImageFileName(name: string): ParsedImageFileName {
  const base = name.trim().replace(IMAGE_EXTENSION, '').trim();
  const match = SEQ_SUFFIX.exec(base);
  if (!match) {
    return { code: base, seq: null, error: null };
  }
  const seq = Number(match[2]);
  return {
    code: match[1].trim(),
    seq,
    error: seq >= SEQ_MIN && seq <= SEQ_MAX ? null : 'SEQ_OUT_OF_RANGE',
  };
}
