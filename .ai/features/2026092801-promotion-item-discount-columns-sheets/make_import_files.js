// Builds the .xlsx inputs for verify_ui.py with the API's own exceljs.
// Usage (from repo root): node .ai/features/2026092801-promotion-item-discount-columns-sheets/make_import_files.js
const path = require("path");
const ExcelJS = require(path.resolve("apps/api/node_modules/exceljs"));

const OUT = path.join(__dirname, "evidence");
const SHEETS = [
  ["Giảm giá theo %", ["Mã SKU*", "Tên hàng hóa", "% giảm giá"]],
  ["Giảm giá theo số tiền", ["Mã SKU*", "Tên hàng hóa", "Số tiền giảm"]],
  ["Đồng giá", ["Mã SKU*", "Tên hàng hóa"]],
];

async function build(file, rowsBySheet) {
  const wb = new ExcelJS.Workbook();
  for (const [name, header] of SHEETS) {
    const ws = wb.addWorksheet(name);
    ws.addRow(header);
    for (const r of rowsBySheet[name] ?? []) ws.addRow(r);
  }
  await wb.xlsx.writeFile(path.join(OUT, file));
}

(async () => {
  require("fs").mkdirSync(OUT, { recursive: true });
  // AC-16 (UI): Đồng giá — one code already on the grid, one new, one unknown.
  // The % sheet carries data too, to prove only the Đồng giá sheet is read.
  await build("AC-16-import-dong-gia.xlsx", {
    "Giảm giá theo %": [["GELLI-43-DEN", null, 99]],
    "Đồng giá": [
      ["GELLI-39-DEN", null],
      ["GELLI-40-DEN", null],
      ["KHONG-CO-MA", null],
    ],
  });
  // AC-06 (import): % sheet, a new code → the imported row must carry ĐVT / Giá bán.
  await build("AC-06-import-percent.xlsx", {
    "Giảm giá theo %": [["GELLI-43-DEN", null, 20]],
  });
  console.log("ok");
})();
