/**
 * PRNG có hạt giống — mock của mọi widget dùng chung.
 *
 * Cùng một bộ tham số (kỳ, granularity, bộ lọc, chi nhánh) luôn cho ra cùng một
 * dữ liệu, nên chart đổi rõ rệt khi đổi lựa chọn nhưng không nhấp nháy giữa các
 * lần render.
 */

/** Băm chuỗi thành số nguyên 32-bit (FNV-1a). */
export function hashSeed(...parts: (string | number)[]): number {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    const text = String(part);
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return hash >>> 0;
}

/** Sinh dãy số giả ngẫu nhiên trong [0, 1) từ hạt giống (mulberry32). */
export function createRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Số nguyên trong [min, max]. */
export function randomInt(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

/** Tiền VNĐ làm tròn tới `step` để số liệu mock trông "thật". */
export function randomMoney(
  random: () => number,
  min: number,
  max: number,
  step = 1000,
): number {
  return Math.round(randomInt(random, min, max) / step) * step;
}
