/** Định dạng số/ngày dùng chung cho trang Tổng quan (locale vi-VN). */

const NUMBER = new Intl.NumberFormat("vi-VN");

/** "1.250" — tiền VNĐ không kèm ký hiệu ₫, đúng như spec. */
export function formatViNumber(value: number): string {
  return NUMBER.format(Math.round(value));
}

/** "18/09/2026 09:55" — dùng cho header row 1 và footer "Dữ liệu: …". */
export function formatViDateTimeShort(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}` +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
