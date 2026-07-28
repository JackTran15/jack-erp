/**
 * Filename handling for generated .xlsx downloads.
 *
 * The `sendXlsx` helper that used to live here buffered a whole workbook and
 * handed it to `res.send`. Exports now stream through `HttpResponseSink`, which
 * sets the same headers before the first byte, so only the slug survives.
 */

/** Strip Vietnamese diacritics and punctuation to a safe ASCII file slug. */
export function toFileSlug(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'export'
  );
}
