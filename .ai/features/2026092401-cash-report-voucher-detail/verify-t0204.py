"""T-02-04: Số hóa đơn / Tham chiếu on the cash-fund reports open "Chi tiết hóa đơn" (UOW-02, AC-08..11).

Same environment as verify-t0103.py (erp_test fixture after the cash-fund-report-list e2e,
API :4055, FE :3006 with VITE_API_BASE_URL=http://localhost:4055):

    ~/.venvs/aidlc-verify/bin/python .ai/features/2026092401-cash-report-voucher-detail/verify-t0204.py

The fixture has no invoice-linked voucher, so the script points PT000002 at invoice HD-A1
(INVOICE) and PC000004 at it (REFUND) — HD-A1 is left behind by cash-fund-report-list — and
restores both references at the end. Footer totals are compared with the API's totals read
before the links were made (AC-08: linking changes no money figure). AC-11 drops
`reporting.invoice.branch.read` in the browser the same way verify-t0103.py drops
`accounting.cash_payment.read`. Screenshots land in evidence/t0204-*.png.
"""
import asyncio, json, os, subprocess, sys, urllib.request
from playwright.async_api import async_playwright

BASE = os.environ.get("FE_URL", "http://localhost:3006")
API = os.environ.get("API_URL", "http://localhost:4055")
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "evidence")
ORG = "a0000000-0000-4000-8000-000000000001"
BRANCH_A = "b0000000-0000-4000-8000-000000000001"
INVOICE = "HD-A1"
LINKS = {"PT000002": ("cash_receipts", "cash_receipt_reference_type_enum", "INVOICE"),
         "PC000004": ("cash_payments", "cash_payment_reference_type_enum", "REFUND")}
# AC-10's non-invoice references; the fixture only has MANUAL, so two vouchers borrow these
# types for the run (reference_id is a dummy — nothing joins it to an invoice).
NON_INVOICE = {"PT000003": ("cash_receipts", "cash_receipt_reference_type_enum", "FUND_SWAP"),
               "PC000001": ("cash_payments", "cash_payment_reference_type_enum", "GOODS_RECEIPT")}
DUMMY_REF = "00000000-0000-4000-8000-00000000f00d"
failures = []

def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not ok: failures.append(name)

# DB access goes through node + apps/api's own `pg` / `ioredis`, with DB_* / REDIS_* read from
# apps/api/.env the way the e2e global-setup does — no credential in this file or on a command line.
API_DIR = os.path.abspath(os.path.join(HERE, "..", "..", "..", "apps", "api"))
NODE_HELPER = r"""
const path = require("path"), api = process.cwd();
require(require.resolve("dotenv", { paths: [api] })).config({ path: path.join(api, ".env"), quiet: true });
const [, mode, a, b] = process.argv;  // `node -e` has no script path in argv
(async () => {
  if (mode === "perm-cache") {
    const Redis = require(require.resolve("ioredis", { paths: [api] }));
    const r = new Redis({ host: process.env.REDIS_HOST || "localhost", port: +(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined, db: +(process.env.REDIS_DB || 0) });
    const keys = await r.keys(`*perms:${a}:${b}`);
    if (keys.length) await r.del(...keys);
    console.log(JSON.stringify(keys)); return r.quit();
  }
  const { Client } = require(require.resolve("pg", { paths: [api] }));
  const c = new Client({ host: process.env.DB_HOST || "localhost", port: +(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || "postgres", password: process.env.DB_PASS || "postgres",
    database: process.env.E2E_DB_NAME || "erp_test" });
  await c.connect();
  const res = await c.query(a, JSON.parse(b || "[]"));
  console.log(JSON.stringify(res.rows)); await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
"""

def node(*args):
    p = subprocess.run(["node", "-e", NODE_HELPER, "--", *args], cwd=API_DIR, capture_output=True, text=True)
    if p.returncode: raise RuntimeError(f"node helper failed: {p.stderr.strip()[-300:]}\n{args[:1]}")
    return json.loads(p.stdout.strip().splitlines()[-1])

def sql(q, params=None):
    return node("sql", q, json.dumps(params or []))

def api(method, path, body=None, tok=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"content-type": "application/json", "x-branch-id": BRANCH_A,
                                          **({"authorization": f"Bearer {tok}"} if tok else {})})
    try:
        with urllib.request.urlopen(req) as r: return json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {path} → {e.code}: {e.read().decode()[:300]}")

def api_totals():
    tok = api("POST", "/auth/login", {"organizationId": ORG, "email": "admin@test.com", "password": "password123"})["accessToken"]
    body = api("POST", "/reports/cash-fund/search", {"reportType": "cash-in-out-list", "columns": ["documentNumber", "amountIn", "amountOut"],
                                                     "filters": {"period": {"from": "2026-09-01", "to": "2026-09-30"}, "branchId": BRANCH_A}}, tok)
    return body["totals"]

def setup():
    inv = sql("SELECT id FROM invoices WHERE organization_id = $1 AND branch_id = $2 AND code = $3", [ORG, BRANCH_A, INVOICE])
    if not inv: raise RuntimeError(f"invoice {INVOICE} missing — run `pnpm --filter @erp/api test:e2e -- cash-fund-report-list` first")
    orig = {}
    for num, (table, _, kind) in {**LINKS, **NON_INVOICE}.items():
        orig[num] = sql(f"SELECT reference_type::text AS t, reference_id AS i FROM {table} WHERE organization_id = $1 AND document_number = $2", [ORG, num])[0]
        ref = inv[0]["id"] if num in LINKS else DUMMY_REF
        sql(f"UPDATE {table} SET reference_type = $3, reference_id = $4 WHERE organization_id = $1 AND document_number = $2", [ORG, num, kind, ref])
    return orig

def restore(orig):
    for num, (table, enum, _) in {**LINKS, **NON_INVOICE}.items():
        sql(f"UPDATE {table} SET reference_type = $3::{enum}, reference_id = $4 WHERE organization_id = $1 AND document_number = $2",
            [ORG, num, orig[num]["t"], orig[num]["i"]])

async def click_center(page, loc):
    b = await loc.bounding_box(); await page.mouse.click(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)

async def run_report(page, name):
    await page.get_by_role("button", name="Chọn báo cáo").click(); await page.wait_for_timeout(600)
    dlg = page.locator("[data-state=open][role=dialog]").last
    combos = dlg.locator("button[role=combobox]")
    if (await combos.first.inner_text()).strip() != name:
        await click_center(page, combos.first); await page.wait_for_timeout(500)
        await page.get_by_text(name, exact=True).last.click(); await page.wait_for_timeout(400)
        dlg = page.locator("[data-state=open][role=dialog]").last
    await dlg.get_by_label("Từ ngày").fill("2026-09-01")
    await dlg.get_by_label("Đến ngày").fill("2026-09-30")
    await dlg.get_by_role("button", name="Đồng ý").click()
    await page.wait_for_timeout(2000)

async def set_column(page, label, on):
    """Sửa mẫu: tick/untick one column and save (or restore the default template when label is None)."""
    await page.get_by_role("button", name="Thiết lập cột hiển thị").click(); await page.wait_for_timeout(700)
    cfg = page.locator("[role=dialog]").last
    if label is None:
        await cfg.get_by_role("button", name="Lấy mẫu ngầm định").click(); await page.wait_for_timeout(300)
    else:
        box = cfg.locator("tbody tr", has=page.locator("td", has_text=label)).first.locator("button[role=checkbox], input[type=checkbox]").first
        state = await box.get_attribute("aria-checked") or str(await box.is_checked()).lower()
        if (state == "true") != on: await box.click()
    await cfg.get_by_role("button", name="Lưu").click(); await page.wait_for_timeout(1800)

async def grid(page):
    hs = await page.locator("table").first.locator("thead th").evaluate_all("ths => ths.map(th => th.textContent.trim())")
    rs = await page.locator("table").first.locator("tbody tr").evaluate_all(
        "trs => trs.map(tr => Array.from(tr.querySelectorAll('td')).map(td => [td.textContent.trim(), !!td.querySelector('a, button')]))")
    return hs, [r for r in rs if r and any(c[0] for c in r)]

async def footer(page):
    return await page.eval_on_selector_all("table tfoot td, table tfoot th", "els => els.map(e => e.textContent.trim())")

async def click_cell(page, row_number, col_label):
    hs, _ = await grid(page)
    ci = hs.index(col_label)
    row = page.locator("table").first.locator("tbody tr", has=page.locator("td", has_text=row_number)).first
    n_before = await page.locator("[data-state=open][role=dialog]").count()
    await row.locator("td").nth(ci).locator("a, button").first.click()
    for _ in range(30):
        await page.wait_for_timeout(300)
        if await page.locator("[data-state=open][role=dialog]").count() > n_before: break
    await page.wait_for_timeout(1200)
    return await page.locator("[data-state=open][role=dialog]").last.inner_text()

async def close_top(page):
    top = page.locator("[data-state=open][role=dialog]").last
    btn = top.get_by_role("button", name="Đóng", exact=True)
    if await btn.count(): await btn.last.click()
    else: await page.keyboard.press("Escape")
    await page.wait_for_timeout(700)

async def login(page):
    await page.goto(f"{BASE}/login", wait_until="networkidle")
    await page.fill("#login-org-id", ORG); await page.fill("#login-email", "admin@test.com"); await page.fill("#login-password", "password123")
    await page.click("button[type=submit]"); await page.wait_for_url(lambda u: "/login" not in u, timeout=20000)
    await page.goto(f"{BASE}/reports/cash-fund", wait_until="networkidle"); await page.wait_for_timeout(1200)

def fmt(n):
    return f"{int(round(float(n))):,}".replace(",", ".")

async def main():
    os.makedirs(OUT, exist_ok=True)
    before = api_totals()
    orig = setup()
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            ctx = await b.new_context(viewport={"width": 1440, "height": 900}); page = await ctx.new_page()
            errs = []; page.on("console", lambda m: errs.append(m.text[:160]) if m.type == "error" else None)
            await login(page)

            # ---- #3 Bảng kê thu chi ----
            await run_report(page, "Bảng kê thu chi")
            await set_column(page, "Số hóa đơn", True)
            hs, rs = await grid(page)
            ci, cr, cn = hs.index("Số chứng từ"), hs.index("Tham chiếu"), hs.index("Số hóa đơn")
            by = {r[ci][0]: r for r in rs if r[ci][0]}
            pt, pc = by.get("PT000002"), by.get("PC000004")
            check("AC-08 POS receipt PT000002: Số hóa đơn HD-A1 + Tham chiếu 'INVOICE HD-A1', both links",
                  pt and pt[cn] == [INVOICE, True] and pt[cr] == [f"INVOICE {INVOICE}", True], str(pt and (pt[cn], pt[cr])))
            check("AC-08 refund PC000004: Số hóa đơn HD-A1 + Tham chiếu 'REFUND HD-A1', both links",
                  pc and pc[cn] == [INVOICE, True] and pc[cr] == [f"REFUND {INVOICE}", True], str(pc and (pc[cn], pc[cr])))
            others = [(n, r[cr]) for n, r in by.items() if n not in LINKS]
            kinds = {c[0].split(" ")[0] for _, c in others}
            check("AC-10 fixture now carries MANUAL, FUND_SWAP and GOODS_RECEIPT references", {"MANUAL", "FUND_SWAP", "GOODS_RECEIPT"} <= kinds, str(kinds))
            check("AC-10 MANUAL / FUND_SWAP / GOODS_RECEIPT references are plain text, Số hóa đơn empty",
                  others and all(not c[1] for _, c in others) and all(not by[n][cn][0] for n, _ in others), str(others))
            ft = await footer(page)
            check(f"AC-08 footer Tiền thu / Tiền chi unchanged by linking ({fmt(before['amountIn'])} / {fmt(before['amountOut'])})",
                  fmt(before["amountIn"]) in ft and fmt(before["amountOut"]) in ft, str(ft))
            await page.screenshot(path=f"{OUT}/t0204-01-bang-ke-so-hoa-don.png", full_page=True)

            text = await click_cell(page, "PT000002", "Số hóa đơn")
            check("AC-09 Số hóa đơn of PT000002 opens Chi tiết hóa đơn HD-A1", "Chi tiết hóa đơn" in text and INVOICE in text, text[:120].replace("\n", " | "))
            await page.screenshot(path=f"{OUT}/t0204-02-hoa-don-tu-so-hoa-don.png"); await close_top(page)
            text = await click_cell(page, "PC000004", "Tham chiếu")
            check("AC-09/10 Tham chiếu 'REFUND HD-A1' of PC000004 opens the same invoice", "Chi tiết hóa đơn" in text and INVOICE in text, text[:120].replace("\n", " | "))
            await page.screenshot(path=f"{OUT}/t0204-03-hoa-don-tu-tham-chieu-refund.png"); await close_top(page)
            text = await click_cell(page, "PT000002", "Tham chiếu")
            check("AC-10 Tham chiếu 'INVOICE HD-A1' of PT000002 opens the invoice", "Chi tiết hóa đơn" in text and INVOICE in text, text[:120].replace("\n", " | "))
            await close_top(page)
            await set_column(page, None, False)

            # ---- #5 Bảng kê tiền chi theo mục chi ----
            await run_report(page, "Bảng kê tiền chi theo mục chi")
            await set_column(page, "Số hóa đơn", True)
            hs, rs = await grid(page)
            ci, cn = hs.index("Số chứng từ"), hs.index("Số hóa đơn")
            refund = [r for r in rs if r[ci][0] == "PC000004"]
            rest = [r[cn] for r in rs if r[ci][0] and r[ci][0] != "PC000004"]
            check("AC-09 #5 refund line PC000004 has Số hóa đơn HD-A1 as a link", refund and refund[0][cn] == [INVOICE, True], str(refund and refund[0][cn]))
            check("AC-09 #5 other lines have no invoice link", rest and not any(c[1] for c in rest), str(rest))
            await page.screenshot(path=f"{OUT}/t0204-04-bang-ke-muc-chi.png", full_page=True)
            text = await click_cell(page, "PC000004", "Số hóa đơn")
            check("AC-09 #5 clicking it opens Chi tiết hóa đơn HD-A1", "Chi tiết hóa đơn" in text and INVOICE in text, text[:120].replace("\n", " | "))
            await page.screenshot(path=f"{OUT}/t0204-05-hoa-don-tu-muc-chi.png"); await close_top(page)
            await set_column(page, None, False)
            check("no console errors", not errs, str(errs[:3]))
            await ctx.close()

            # ---- AC-11: without reporting.invoice.branch.read ----
            ctx = await b.new_context(viewport={"width": 1440, "height": 900}); page = await ctx.new_page()
            await page.add_init_script("""
              const set = Storage.prototype.setItem;
              Storage.prototype.setItem = function (k, v) {
                if (k === 'user_permissions') { try { v = JSON.stringify(JSON.parse(v).filter(p => p !== 'reporting.invoice.branch.read')); } catch (e) {} }
                return set.call(this, k, v);
              };
            """)
            await login(page)
            perms = await page.evaluate("JSON.parse(localStorage.getItem('user_permissions') || '[]')")
            check("AC-11 setup: session lacks reporting.invoice.branch.read, keeps reporting.cash.read",
                  "reporting.invoice.branch.read" not in perms and "reporting.cash.read" in perms, f"{len(perms)} perms")
            await run_report(page, "Bảng kê thu chi")
            await set_column(page, "Số hóa đơn", True)
            hs, rs = await grid(page)
            ci, cr, cn = hs.index("Số chứng từ"), hs.index("Tham chiếu"), hs.index("Số hóa đơn")
            linked = [(r[ci][0], r[cn], r[cr]) for r in rs if r[ci][0] in LINKS]
            check("AC-11 Số hóa đơn and Tham chiếu are plain text (values still shown)",
                  len(linked) == 2 and all(n[0] == INVOICE and not n[1] and not r[1] and r[0].endswith(INVOICE) for _, n, r in linked), str(linked))
            # (UNC… stays text here: the fixture admin has no accounting.bank_payment.read.)
            cash = [r[ci] for r in rs if r[ci][0][:2] in ("PT", "PC")]
            check("AC-11 Phiếu thu / Phiếu chi numbers keep their voucher link", cash and all(c[1] for c in cash), str(cash))
            await page.screenshot(path=f"{OUT}/t0204-06-thieu-quyen.png", full_page=True)
            await set_column(page, None, False)
            await b.close()
    finally:
        restore(orig)
    print("\n" + ("ALL PASS" if not failures else f"{len(failures)} FAILED: {failures}"))
    sys.exit(1 if failures else 0)

asyncio.run(main())
