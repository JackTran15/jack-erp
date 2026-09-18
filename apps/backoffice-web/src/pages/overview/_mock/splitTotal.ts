/**
 * Chia một tổng nguyên thành N phần theo trọng số ngẫu nhiên có hạt giống.
 *
 * Dùng phép chia phần-dư-lớn-nhất (largest remainder): lấy phần nguyên trước,
 * rồi rải từng đơn vị dư cho các phần có phần thập phân lớn nhất. Nhờ vậy
 * `sum(parts) === total` TUYỆT ĐỐI và không phần nào bị âm — kể cả với số nhỏ
 * như số lượng hóa đơn.
 *
 * Đây là bất biến mà modal chi tiết của row 1 dựa vào: "Tổng" trong modal phải
 * bằng đúng con số hiển thị trên dòng vừa bấm.
 */
export function splitTotal(
  total: number,
  parts: number,
  random: () => number,
): number[] {
  if (parts <= 0) return [];
  if (parts === 1) return [total];
  if (total <= 0) return Array.from({ length: parts }, () => 0);

  const weights = Array.from({ length: parts }, () => random() + 0.05);
  const weightSum = weights.reduce((a, w) => a + w, 0);

  const exact = weights.map((w) => (total * w) / weightSum);
  const out = exact.map(Math.floor);
  let remainder = total - out.reduce((a, v) => a + v, 0);

  // Rải phần dư cho những phần "thiệt" nhất khi làm tròn xuống.
  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);

  for (let i = 0; remainder > 0; i = (i + 1) % parts, remainder -= 1) {
    out[order[i]!.index] += 1;
  }

  return out;
}
