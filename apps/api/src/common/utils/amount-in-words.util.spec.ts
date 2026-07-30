import { amountInWordsVi } from './amount-in-words.util';

describe('amountInWordsVi', () => {
  it('matches the amounts printed on the reference vouchers', () => {
    // examples/ERP/export_Phieu_nhap_kho.xlsx
    expect(amountInWordsVi(18_000_000)).toBe('Mười tám triệu đồng chẵn.');
    // examples/ERP/export_Xuat_Khau_Xuat_Kho.xlsx
    expect(amountInWordsVi(315_000)).toBe('Ba trăm mười lăm nghìn đồng chẵn.');
    // examples/ERP/export_XuatKhauChuyenKho.xlsx
    expect(amountInWordsVi(782_000)).toBe(
      'Bảy trăm tám mươi hai nghìn đồng chẵn.',
    );
  });

  it('reads zero', () => {
    expect(amountInWordsVi(0)).toBe('Không đồng chẵn.');
  });

  it('reads the tens the way Vietnamese does, not digit by digit', () => {
    expect(amountInWordsVi(10)).toBe('Mười đồng chẵn.');
    expect(amountInWordsVi(15)).toBe('Mười lăm đồng chẵn.');
    expect(amountInWordsVi(21)).toBe('Hai mươi mốt đồng chẵn.');
    expect(amountInWordsVi(25)).toBe('Hai mươi lăm đồng chẵn.');
    expect(amountInWordsVi(20)).toBe('Hai mươi đồng chẵn.');
  });

  it('bridges a zero tens with lẻ only when the hundreds are spoken', () => {
    expect(amountInWordsVi(105)).toBe('Một trăm lẻ năm đồng chẵn.');
    expect(amountInWordsVi(5)).toBe('Năm đồng chẵn.');
    expect(amountInWordsVi(100)).toBe('Một trăm đồng chẵn.');
  });

  it('keeps the scale words when middle groups are empty', () => {
    expect(amountInWordsVi(1_000_000_000)).toBe('Một tỷ đồng chẵn.');
    // The empty triệu and nghìn groups stay silent; the final group still
    // speaks its zero hundreds, per the accounting convention.
    expect(amountInWordsVi(1_000_000_001)).toBe(
      'Một tỷ không trăm lẻ một đồng chẵn.',
    );
    expect(amountInWordsVi(2_000_500)).toBe('Hai triệu năm trăm đồng chẵn.');
  });

  it('speaks a zero hundreds inside a non-leading group', () => {
    expect(amountInWordsVi(1_105)).toBe(
      'Một nghìn một trăm lẻ năm đồng chẵn.',
    );
    expect(amountInWordsVi(1_015)).toBe(
      'Một nghìn không trăm mười lăm đồng chẵn.',
    );
  });

  it('reads amounts past a billion', () => {
    expect(amountInWordsVi(12_345_678_901)).toBe(
      'Mười hai tỷ ba trăm bốn mươi lăm triệu sáu trăm bảy mươi tám nghìn chín trăm lẻ một đồng chẵn.',
    );
  });

  it('prefixes a negative amount', () => {
    expect(amountInWordsVi(-315_000)).toBe(
      'Âm ba trăm mười lăm nghìn đồng chẵn.',
    );
  });

  it('rounds to whole đồng and drops "chẵn" when there was a fraction', () => {
    expect(amountInWordsVi(1_000.4)).toBe('Một nghìn đồng.');
    expect(amountInWordsVi(1_000.5)).toBe('Một nghìn không trăm lẻ một đồng.');
  });

  it('returns nothing for a value that is not a number', () => {
    expect(amountInWordsVi(Number.NaN)).toBe('');
    expect(amountInWordsVi(Number.POSITIVE_INFINITY)).toBe('');
  });
});
