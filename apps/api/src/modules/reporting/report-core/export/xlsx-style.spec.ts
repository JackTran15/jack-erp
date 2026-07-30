import * as ExcelJS from 'exceljs';
import { PassThrough } from 'stream';
import { GENERATED_XLSX_FONT_NAME } from '../../../../common/utils/excel-workbook-font.util';
import {
  bodyFont,
  FONT_SIZE_BODY,
  safeSheetName,
  writeBannerRow,
  writeBlankRow,
} from './xlsx-style';

/**
 * Drive the helpers through a real `WorkbookWriter` and read the bytes back —
 * the merge-before-commit ordering only fails on a committed workbook, so
 * asserting against an in-memory sheet would not catch the bug the helper
 * exists to prevent.
 */
async function writeAndRead(
  build: (sheet: ExcelJS.Worksheet) => void,
): Promise<ExcelJS.Worksheet> {
  const target = new PassThrough();
  const chunks: Buffer[] = [];
  target.on('data', (chunk: Buffer) => chunks.push(chunk));
  const closed = new Promise<void>((resolve) => target.on('end', () => resolve()));

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: target,
    useStyles: true,
  });
  const sheet = workbook.addWorksheet('Test');
  build(sheet);
  await sheet.commit();
  await workbook.commit();
  await closed;

  const read = new ExcelJS.Workbook();
  await read.xlsx.load(Buffer.concat(chunks) as unknown as ArrayBuffer);
  return read.worksheets[0];
}

describe('bodyFont', () => {
  it('always carries the generated-file face and defaults the rest', () => {
    expect(bodyFont()).toEqual({
      name: GENERATED_XLSX_FONT_NAME,
      bold: false,
      italic: false,
      size: FONT_SIZE_BODY,
    });
  });

  it('applies weight, slant and size when asked', () => {
    expect(bodyFont({ bold: true, size: 18 })).toEqual({
      name: GENERATED_XLSX_FONT_NAME,
      bold: true,
      italic: false,
      size: 18,
    });
    expect(bodyFont({ italic: true }).italic).toBe(true);
  });
});

describe('writeBannerRow', () => {
  it('merges across the given width and applies font and alignment', async () => {
    const sheet = await writeAndRead((s) => {
      writeBannerRow(s, 'PHIẾU NHẬP KHO', { bold: true, size: 18, align: 'center' }, 5);
    });

    expect(sheet.getCell('A1').value).toBe('PHIẾU NHẬP KHO');
    expect(sheet.getCell('A1').font?.size).toBe(18);
    expect(sheet.getCell('A1').font?.bold).toBe(true);
    expect(sheet.getCell('A1').alignment?.horizontal).toBe('center');
    // A merged cell reports its master's address for every member cell.
    expect(sheet.getCell('E1').master.address).toBe('A1');
  });

  it('leaves a single-column banner unmerged', async () => {
    const sheet = await writeAndRead((s) => {
      writeBannerRow(s, 'Một cột', { align: 'left' }, 1);
    });

    expect(sheet.getCell('A1').value).toBe('Một cột');
    expect(sheet.getCell('A1').isMerged).toBe(false);
  });

  it('keeps successive banners on successive rows', async () => {
    const sheet = await writeAndRead((s) => {
      writeBannerRow(s, 'Chi nhánh Quận 1', { bold: true }, 3);
      writeBannerRow(s, '12 Lê Lợi', {}, 3);
      writeBlankRow(s);
      writeBannerRow(s, 'Số: NK000383', { align: 'center' }, 3);
    });

    expect(sheet.getCell('A1').value).toBe('Chi nhánh Quận 1');
    expect(sheet.getCell('A2').value).toBe('12 Lê Lợi');
    expect(sheet.getCell('A3').value).toBeNull();
    expect(sheet.getCell('A4').value).toBe('Số: NK000383');
  });
});

describe('safeSheetName', () => {
  it('strips characters Excel rejects and clamps the length', () => {
    const name = safeSheetName(
      'Nhập/Xuất: kho [2026] rất là dài quá ba mươi mốt ký tự',
      'Báo cáo',
    );

    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).not.toMatch(/[[\]:*?/\\]/);
  });

  it('falls back when the cleaned name is empty', () => {
    expect(safeSheetName('///', 'Báo cáo')).toBe('   ');
    expect(safeSheetName('', 'Báo cáo')).toBe('Báo cáo');
  });
});
