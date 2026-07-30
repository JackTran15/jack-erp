/**
 * Vietnamese amount in words, for the "Số tiền viết bằng chữ" line every
 * printed voucher carries.
 *
 * Vietnamese number reading is not a digit-by-digit lookup — the same digit is
 * read differently depending on its position:
 *
 *  - the tens digit is `mười` at 10..19 but `mươi` from 20 up (`mười lăm` vs
 *    `hai mươi lăm`);
 *  - a unit of 1 becomes `mốt` after a `mươi` (`hai mươi mốt`), and a unit of 5
 *    becomes `lăm` after any tens (`mười lăm`, `hai mươi lăm`);
 *  - a zero tens digit inside a group is spoken as `lẻ` (`một trăm lẻ năm`),
 *    and a zero hundreds digit in a non-leading group still has to be spoken
 *    (`một tỷ không trăm triệu` is wrong; the group is simply skipped) —
 *    which is why groups are assembled from the top down with their scale word
 *    rather than concatenated blindly.
 */

const DIGITS = [
  'không',
  'một',
  'hai',
  'ba',
  'bốn',
  'năm',
  'sáu',
  'bảy',
  'tám',
  'chín',
];

/** Group scales, smallest first — index matches the group position. */
const SCALES = ['', 'nghìn', 'triệu', 'tỷ'];

/**
 * Read a 0..999 group.
 *
 * `withLeadingHundred` is true for every group except the most significant one:
 * `105` alone reads `một trăm lẻ năm`, but as the middle group of 1_105 it
 * still needs its hundreds spoken even when zero (`một nghìn một trăm lẻ năm`).
 */
function readGroup(value: number, withLeadingHundred: boolean): string {
  const hundreds = Math.floor(value / 100);
  const tens = Math.floor((value % 100) / 10);
  const units = value % 10;
  const parts: string[] = [];

  if (hundreds > 0 || withLeadingHundred) {
    parts.push(DIGITS[hundreds], 'trăm');
  }

  if (tens === 0) {
    // `lẻ` only bridges a spoken hundreds place to a lone unit.
    if (units > 0 && parts.length > 0) parts.push('lẻ', DIGITS[units]);
    else if (units > 0) parts.push(DIGITS[units]);
  } else if (tens === 1) {
    parts.push('mười');
    if (units === 5) parts.push('lăm');
    else if (units > 0) parts.push(DIGITS[units]);
  } else {
    parts.push(DIGITS[tens], 'mươi');
    if (units === 1) parts.push('mốt');
    else if (units === 5) parts.push('lăm');
    else if (units > 0) parts.push(DIGITS[units]);
  }

  return parts.join(' ');
}

/** Split into 3-digit groups, most significant first. */
function toGroups(value: number): number[] {
  const groups: number[] = [];
  let rest = value;
  while (rest > 0) {
    groups.unshift(rest % 1000);
    rest = Math.floor(rest / 1000);
  }
  return groups;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * `18000000` → `"Mười tám triệu đồng chẵn."`
 *
 * Rounded to whole đồng first: VND has no sub-unit in any of the documents this
 * feeds, and reading a fraction would produce a line no accountant would sign.
 * A round amount ends `đồng chẵn.`, anything else just `đồng.` — the same
 * convention the reference vouchers use.
 */
export function amountInWordsVi(value: number): string {
  if (!Number.isFinite(value)) return '';

  const rounded = Math.round(Math.abs(value));
  const isExact = Math.abs(Math.abs(value) - rounded) < Number.EPSILON;
  const suffix = isExact ? 'đồng chẵn.' : 'đồng.';
  const sign = value < 0 ? 'âm ' : '';

  if (rounded === 0) return capitalise(`${sign}không ${suffix}`);

  const groups = toGroups(rounded);
  const spoken: string[] = [];

  groups.forEach((group, index) => {
    const scale = SCALES[groups.length - 1 - index] ?? '';
    // A zero group contributes no words, and no scale word either — the scale
    // is carried by whichever group above it was non-zero.
    if (group === 0) return;
    spoken.push(readGroup(group, index > 0));
    if (scale) spoken.push(scale);
  });

  return capitalise(`${sign}${spoken.join(' ')} ${suffix}`);
}
