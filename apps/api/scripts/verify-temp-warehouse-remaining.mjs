#!/usr/bin/env node
/**
 * Verify — Báo cáo "Hàng hoá xuất kho tạm" (temp-warehouse out goods).
 *
 * Kiểm tra cột SL tồn (remainingQty) do API đang chạy trả về có đúng công thức
 * Nhập−Xuất−Tồn kiểu MISA hay không, mà KHÔNG cần truy cập DB — chỉ gọi API:
 *
 *   SL tồn (remainingQty) === SL xuất (outQty) − SL trả (returnQty) − SL bán (saleQty)
 *
 * và đối chiếu tổng: Σ tồn === Σ xuất − Σ trả − Σ bán.
 *
 * Cách chạy (trên server, Node >= 18):
 *   API_BASE="http://localhost:4000" \
 *   TOKEN="<access_token>" \
 *   BRANCH_IDS="<branchId>" \        # tùy chọn, phân tách bằng dấu phẩy
 *   PRESET="this_month" \            # hoặc dùng START_DATE/END_DATE với PRESET=custom
 *   node apps/api/scripts/verify-temp-warehouse-remaining.mjs
 *
 *   # Kỳ tùy chọn:
 *   PRESET="custom" START_DATE="2026-07-01" END_DATE="2026-07-31" node ...
 *
 * Lấy TOKEN: đăng nhập backoffice → DevTools → Network → copy phần sau "Bearer "
 * trong header Authorization của một request bất kỳ.
 *
 * Exit code 0 = mọi dòng khớp; 1 = có sai lệch hoặc lỗi gọi API.
 *
 * LƯU Ý: report có cache (TTL vài phút). Ngay sau khi deploy bản fix, nếu còn
 * thấy sai lệch thì có thể do cache cũ — đợi hết TTL rồi chạy lại.
 */

const API_BASE = process.env.API_BASE;
const TOKEN = process.env.TOKEN;
const BRANCH_IDS = process.env.BRANCH_IDS || "";
const PRESET = process.env.PRESET || "this_month";
const START_DATE = process.env.START_DATE || "";
const END_DATE = process.env.END_DATE || "";
const PAGE_SIZE = Number(process.env.PAGE_SIZE || 200);
const ENDPOINT = "/reports/inventory/temporary-warehouse-out-goods";

if (!API_BASE || !TOKEN) {
  console.error("Thiếu API_BASE hoặc TOKEN. Xem hướng dẫn ở đầu file.");
  process.exit(1);
}

function buildUrl(page) {
  const u = new URL(API_BASE.replace(/\/$/, "") + ENDPOINT);
  u.searchParams.set("page", String(page));
  u.searchParams.set("pageSize", String(PAGE_SIZE));
  if (PRESET) u.searchParams.set("preset", PRESET);
  if (START_DATE) u.searchParams.set("startDate", START_DATE);
  if (END_DATE) u.searchParams.set("endDate", END_DATE);
  if (BRANCH_IDS) u.searchParams.set("branchIds", BRANCH_IDS);
  return u.toString();
}

// API trả { data: [...], total, ... }; phòng khi có lớp bọc { data: { data, total } }.
function extract(json) {
  if (Array.isArray(json?.data)) {
    return { rows: json.data, total: json.total ?? json.data.length };
  }
  if (Array.isArray(json?.data?.data)) {
    return { rows: json.data.data, total: json.data.total ?? json.data.data.length };
  }
  throw new Error("Response không đúng dạng mong đợi: " + JSON.stringify(json).slice(0, 300));
}

async function fetchPage(page) {
  const headers = { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" };
  if (BRANCH_IDS) headers["X-Branch-Id"] = BRANCH_IDS.split(",")[0].trim();
  const res = await fetch(buildUrl(page), { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} khi gọi ${ENDPOINT}: ${body.slice(0, 300)}`);
  }
  return extract(await res.json());
}

async function main() {
  const all = [];
  let page = 1;
  let total = Infinity;
  while (all.length < total) {
    const { rows, total: t } = await fetchPage(page);
    total = t;
    if (rows.length === 0) break;
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    page += 1;
  }

  let sumOut = 0, sumReturn = 0, sumSale = 0, sumRemaining = 0;
  const violations = [];
  for (const r of all) {
    const out = Number(r.outQty) || 0;
    const ret = Number(r.returnQty) || 0;
    const sale = Number(r.saleQty) || 0;
    const rem = Number(r.remainingQty) || 0;
    const expected = out - ret - sale;
    sumOut += out; sumReturn += ret; sumSale += sale; sumRemaining += rem;
    if (rem !== expected) {
      violations.push({ sku: r.sku, date: r.date, time: r.time, out, ret, sale, remaining: rem, expected });
    }
  }

  const expectedTotal = sumOut - sumReturn - sumSale;
  console.log(`\nĐã lấy ${all.length}/${total} dòng từ ${ENDPOINT}`);
  console.log("─".repeat(64));
  console.log(`Σ SL xuất : ${sumOut}`);
  console.log(`Σ SL trả  : ${sumReturn}`);
  console.log(`Σ SL bán  : ${sumSale}`);
  console.log(`Σ SL tồn  : ${sumRemaining}   (kỳ vọng: ${expectedTotal})`);
  console.log("─".repeat(64));

  const totalOk = sumRemaining === expectedTotal;
  if (violations.length === 0 && totalOk) {
    console.log("✅ PASS — mọi dòng: SL tồn = SL xuất − SL trả − SL bán; tổng khớp.");
    process.exit(0);
  }

  if (violations.length) {
    console.log(`❌ ${violations.length} dòng SAI công thức:`);
    for (const v of violations.slice(0, 50)) {
      console.log(
        `  ${v.sku} ${v.date} ${v.time}  xuất=${v.out} trả=${v.ret} bán=${v.sale}` +
          `  → tồn=${v.remaining} (đúng phải ${v.expected})`,
      );
    }
    if (violations.length > 50) console.log(`  … và ${violations.length - 50} dòng nữa`);
  }
  if (!totalOk) {
    console.log(`❌ Tổng SL tồn (${sumRemaining}) ≠ Σxuất−Σtrả−Σbán (${expectedTotal}).`);
  }
  process.exit(1);
}

main().catch((e) => {
  console.error("Lỗi:", e.message);
  process.exit(1);
});
