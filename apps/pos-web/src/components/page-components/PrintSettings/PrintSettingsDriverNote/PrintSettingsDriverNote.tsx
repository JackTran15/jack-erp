/**
 * Cảnh báo đặt ngay đầu trang: phần lớn ca "bill lệch sang phải" là do driver
 * máy in đang hiểu khổ giấy là A4 rồi canh giữa khối 80mm trên tờ rộng đó. CSS
 * ở đây không sửa được chuyện đó — phải chỉnh trong hộp thoại in trước, nếu
 * không sẽ mất thời gian rà từng thông số mà vẫn lệch.
 */
export function PrintSettingsDriverNote() {
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
      <p className="text-[13px] font-bold text-amber-900">
        Kiểm tra cài đặt máy in TRƯỚC khi rà thông số bên dưới
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12px] leading-snug text-amber-900">
        <li>
          Trong hộp thoại in của Chrome: <b>Paper size</b> = khổ giấy nhiệt
          (80&nbsp;×&nbsp;297mm), <b>Margins</b> = None, <b>Scale</b> = 100%.
        </li>
        <li>
          Nếu Paper size đang là A4/Letter, bill 80mm sẽ bị canh giữa tờ A4 và
          dạt sang phải — chỉnh thông số ở trang này cũng không cứu được.
        </li>
        <li>
          Đã đúng khổ mà vẫn lệch thì mới dùng <b>Căn ngang</b> = Ghim mép trái
          và <b>Dịch ngang</b> (số âm) để kéo về.
        </li>
      </ul>
    </div>
  );
}
