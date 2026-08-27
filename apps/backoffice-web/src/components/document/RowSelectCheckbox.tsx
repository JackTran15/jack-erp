import { useEffect, useRef } from "react";

interface RowSelectCheckboxProps {
  checked: boolean;
  onToggle: () => void;
}

interface SelectAllCheckboxProps {
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
  onToggle: () => void;
  /**
   * Chỉ đặt khi phạm vi "tất cả" hẹp hơn "mọi dòng đang hiển thị" — ví dụ Kiểm kê kho
   * chỉ tick những phiếu gộp được. Nhãn mặc định sẽ nói sai ở những chỗ đó.
   */
  label?: string;
}

/**
 * Ô tick đầu dòng của bảng danh sách chứng từ.
 *
 * `stopPropagation` là phần load-bearing: `<tr>` cha có `onRowClick` đổi dòng đang
 * xem (kéo theo fetch chi tiết). Không chặn thì tick lại quay về đúng hành vi cũ.
 */
export function RowSelectCheckbox({ checked, onToggle }: RowSelectCheckboxProps) {
  return (
    <input
      type="checkbox"
      aria-label="Chọn dòng"
      checked={checked}
      onChange={onToggle}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/**
 * Ô tick trên header — tick/bỏ tick toàn bộ dòng đang hiển thị.
 *
 * `indeterminate` là thuộc tính DOM, không phải HTML attribute, nên JSX không đặt
 * được; phải ghi qua ref sau mỗi lần render.
 */
export function SelectAllCheckbox({
  checked,
  indeterminate,
  disabled,
  onToggle,
  label = "Chọn tất cả dòng đang hiển thị",
}: SelectAllCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={onToggle}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
