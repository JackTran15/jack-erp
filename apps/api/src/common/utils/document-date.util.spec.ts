import { toLongVietnameseDate } from './document-date.util';

describe('toLongVietnameseDate', () => {
  it('matches the date line on the reference vouchers', () => {
    // examples/ERP/export_Phieu_nhap_kho.xlsx → "Ngày 28 tháng 7 năm 2026"
    expect(toLongVietnameseDate(new Date(2026, 6, 28))).toBe(
      '28 tháng 7 năm 2026',
    );
    // examples/ERP/export_XuatKhauChuyenKho.xlsx → "Ngày 1 tháng 7 năm 2026"
    expect(toLongVietnameseDate(new Date(2026, 6, 1))).toBe('1 tháng 7 năm 2026');
  });

  it('pads nothing', () => {
    expect(toLongVietnameseDate(new Date(2026, 0, 5))).toBe('5 tháng 1 năm 2026');
  });

  it('omits the leading word so the template can place it', () => {
    expect(toLongVietnameseDate(new Date(2026, 6, 28))).not.toContain('Ngày');
  });
});
