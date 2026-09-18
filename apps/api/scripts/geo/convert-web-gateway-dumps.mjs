#!/usr/bin/env node
/**
 * Chuyển hai dump Mongo của database `web_gateway` (collections `provinces`, `wards`)
 * thành bộ dữ liệu commit được cho migration `LoadGeoDataset*`.
 *
 *   node apps/api/scripts/geo/convert-web-gateway-dumps.mjs <provinces.json> <wards.json> [--out <dir>]
 *
 * Mặc định ghi vào apps/api/src/database/migrations/data/geo-2026/. Bỏ `_id` và các
 * wrapper Mongo (`$oid`, `$date`), đổi `district_code: ''` thành null, sắp xếp xác định
 * để chạy lại cho ra file giống hệt byte. Không sửa nội dung (giữ nguyên tên, mã).
 *
 * Thoát 1 khi dump vi phạm toàn vẹn: trùng mã tỉnh, trùng (province_code, code) phường,
 * phường trỏ tới province_code không có trong mã tỉnh lẫn merged_from, tên rỗng.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
if (outIdx >= 0 && !args[outIdx + 1]) {
  console.error('usage: convert-web-gateway-dumps.mjs <provinces.json> <wards.json> [--out <dir>]');
  process.exit(2);
}
const outDir =
  outIdx >= 0
    ? resolve(args[outIdx + 1])
    : resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'database', 'migrations', 'data', 'geo-2026');
const positional = outIdx >= 0 ? args.filter((_, i) => i !== outIdx && i !== outIdx + 1) : args;
if (positional.length !== 2) {
  console.error('usage: convert-web-gateway-dumps.mjs <provinces.json> <wards.json> [--out <dir>]');
  process.exit(2);
}
const [provincesPath, wardsPath] = positional.map((p) => resolve(p));

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const dateOnly = (v) => {
  const raw = v && typeof v === 'object' && '$date' in v ? v.$date : v;
  return typeof raw === 'string' ? raw.slice(0, 10) : '';
};

const errors = [];

const provinces = readJson(provincesPath)
  .map((p) => ({
    code: str(p.code),
    name: str(p.name),
    isActive: p.is_active !== false,
    effectiveFrom: dateOnly(p.effective_from),
    mergedFrom: (Array.isArray(p.merged_from) ? p.merged_from : [])
      .map((m) => ({ code: str(m.code), name: str(m.name) }))
      .sort((a, b) => byString(a.code, b.code)),
  }))
  .sort((a, b) => byString(a.code, b.code));

const provinceCodes = new Set();
const mergedCodes = new Set();
for (const p of provinces) {
  if (!p.code) errors.push(`province without code: ${JSON.stringify(p)}`);
  if (!p.name) errors.push(`province ${p.code}: empty name`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.effectiveFrom)) errors.push(`province ${p.code}: bad effective_from`);
  if (provinceCodes.has(p.code)) errors.push(`province code duplicated: ${p.code}`);
  provinceCodes.add(p.code);
  for (const m of p.mergedFrom) {
    if (!m.code || !m.name) errors.push(`province ${p.code}: merged_from entry missing code/name`);
    mergedCodes.add(m.code);
  }
}

const wards = readJson(wardsPath)
  .map((w) => ({
    code: str(w.code),
    name: str(w.name),
    provinceCode: str(w.province_code),
    districtCode: str(w.district_code) || null,
  }))
  .sort((a, b) => byString(a.provinceCode, b.provinceCode) || byString(a.code, b.code));

const wardKeys = new Set();
// Mã phường phải duy nhất trong bộ hiện hành: GET /v2/geo/wards/:code không kèm
// provinceCode tra đúng bộ này (A-07). Dump nào phá điều đó phải fail ở đây.
const currentCodes = new Set();
let current = 0;
for (const w of wards) {
  const key = `${w.provinceCode}|${w.code}`;
  if (!w.code || !w.provinceCode) errors.push(`ward without code/province_code: ${JSON.stringify(w)}`);
  if (!w.name) errors.push(`ward ${key}: empty name`);
  if (wardKeys.has(key)) errors.push(`ward (province_code, code) duplicated: ${key}`);
  wardKeys.add(key);
  if (!provinceCodes.has(w.provinceCode) && !mergedCodes.has(w.provinceCode)) {
    errors.push(`ward ${key} (${w.name}): province_code not in provinces nor merged_from`);
  }
  if (provinceCodes.has(w.provinceCode)) {
    current += 1;
    if (currentCodes.has(w.code)) errors.push(`ward code duplicated among current wards: ${w.code}`);
    currentCodes.add(w.code);
  }
}

if (errors.length > 0) {
  console.error(`${errors.length} integrity problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'provinces.json'), JSON.stringify(provinces, null, 2) + '\n');
writeFileSync(join(outDir, 'wards.json'), JSON.stringify(wards, null, 2) + '\n');
console.log(
  `provinces=${provinces.length} wards=${wards.length} (current=${current} legacy=${wards.length - current}) → ${outDir}`,
);
