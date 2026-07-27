/**
 * Căn ngang khối nội dung trong khổ giấy.
 * - `center`: canh giữa page box (hành vi gốc, `margin: 0 auto`).
 * - `left`: ghim mép trái, dùng khi driver máy in canh giữa trên khổ giấy rộng
 *   hơn thực tế làm bill dạt sang phải.
 */
export type ReceiptHorizontalAlign = "center" | "left";
