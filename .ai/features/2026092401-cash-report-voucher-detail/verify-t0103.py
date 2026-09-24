"""T-01-03: Số chứng từ on the cash-fund reports opens the Sổ quỹ voucher dialog (UOW-01, AC-01..07).

Runs on the erp_test fixture, like the 2026091802-cash-fund-reports scripts: run
`pnpm --filter @erp/api test:e2e -- cash-fund-report-list` first, then serve

    API :4055  PORT=4055 DB_NAME=erp_test node apps/api/dist/main.js
    FE  :3006  VITE_API_BASE_URL=http://localhost:4055 vite --port 3006

and run with the aidlc-verify venv:

    ~/.venvs/aidlc-verify/bin/python .ai/features/2026092401-cash-report-voucher-detail/verify-t0103.py

The fixture has no Chi tiền gửi and no invoice-linked receipt, so the script adds one
bank payment through the API (kept; it is tagged and reused on the next run) and points
PT000002 at invoice HD-A1 (left by cash-fund-report-list) for AC-07, restoring it at the end.
AC-06 narrows permissions in the browser: an init script drops `accounting.cash_payment.read`
whenever the app writes `user_permissions`, so it survives the session refresh on reload.
Screenshots land in evidence/t0103-*.png; exits non-zero on any failure.
"""
import asyncio, json, os, subprocess, sys, urllib.request
from playwright.async_api import async_playwright

BASE = os.environ.get("FE_URL", "http://localhost:3006")
API = os.environ.get("API_URL", "http://localhost:4055")
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "evidence")
ORG = "a0000000-0000-4000-8000-000000000001"
BRANCH_A = "b0000000-0000-4000-8000-000000000001"
BP_REASON = "verify-t0103 Chi tiền gửi"
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

ADMIN_ROLE = "d0000000-0000-4000-8000-000000000001"
BANK_PAYMENT_PERMS = ("accounting.bank_payment.read", "accounting.bank_payment.create")

def login_api():
    return api("POST", "/auth/login", {"organizationId": ORG, "email": "admin@test.com", "password": "password123"})

def set_bank_payment_grant(on):
    """The fixture admin role has no bank_payment permission; lend it read + create for this run."""
    if on:
        sql("""INSERT INTO role_permissions (role_id, permission_id)
               SELECT $1::uuid, p.id FROM permissions p WHERE p.key = ANY($2)
               AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = $1::uuid AND rp.permission_id = p.id)""",
            [ADMIN_ROLE, list(BANK_PAYMENT_PERMS)])
    else:
        sql("DELETE FROM role_permissions WHERE role_id = $1::uuid AND permission_id IN (SELECT id FROM permissions WHERE key = ANY($2))",
            [ADMIN_ROLE, list(BANK_PAYMENT_PERMS)])
    user = login_api()["session"]["userId"]
    node("perm-cache", user, ORG)

ADMIN_USER = "c0000000-0000-4000-8000-000000000001"

def set_branch_b(on):
    """AC-05 needs a user on two branches; the fixture admin is on Main Branch only."""
    if on:
        sql("""INSERT INTO user_branch_assignments (user_id, branch_id, organization_id, assigned_by)
               SELECT $1::uuid, b.id, $2::uuid, $1::uuid FROM branches b WHERE b.organization_id::text = $2::text AND b.name = 'Branch B'
               AND NOT EXISTS (SELECT 1 FROM user_branch_assignments x WHERE x.user_id = $1::uuid AND x.branch_id = b.id)""",
            [ADMIN_USER, ORG])
    else:
        sql("""DELETE FROM user_branch_assignments WHERE user_id::text = $1
               AND branch_id IN (SELECT id FROM branches WHERE organization_id::text = $2 AND name = 'Branch B')""", [ADMIN_USER, ORG])

def setup():
    set_branch_b(True)
    set_bank_payment_grant(True)
    tok = login_api()["accessToken"]
    if not sql("SELECT id FROM bank_payments WHERE organization_id = $1 AND reason = $2 AND deleted_at IS NULL", [ORG, BP_REASON]):
        acc = sql("SELECT id FROM deposit_accounts WHERE organization_id = $1 AND branch_id = $2 AND deleted_at IS NULL LIMIT 1", [ORG, BRANCH_A])
        gl = sql("SELECT id FROM accounts WHERE organization_id = $1 AND code = '642' LIMIT 1", [ORG])
        api("POST", "/bank-payments", {"docDate": "2026-09-10", "depositAccountId": acc[0]["id"], "purpose": "OTHER",
                                       "contraAccountId": gl[0]["id"],
                                       "reason": BP_REASON, "totalAmount": 100000,
                                       "lines": [{"description": "Phí chuyển khoản", "amount": 100000}]}, tok)
    inv = sql("SELECT id FROM invoices WHERE organization_id = $1 AND branch_id = $2 AND code = 'HD-A1'", [ORG, BRANCH_A])
    orig = sql("SELECT reference_type::text AS t, reference_id AS i FROM cash_receipts WHERE organization_id = $1 AND document_number = 'PT000002'", [ORG])[0]
    if inv:
        sql("UPDATE cash_receipts SET reference_type = 'INVOICE', reference_id = $2 WHERE organization_id = $1 AND document_number = 'PT000002'", [ORG, inv[0]["id"]])
    return orig, bool(inv)

def restore(orig):
    sql("UPDATE cash_receipts SET reference_type = $2::cash_receipt_reference_type_enum, reference_id = $3 WHERE organization_id = $1 AND document_number = 'PT000002'",
        [ORG, orig["t"], orig["i"]])
    set_bank_payment_grant(False)
    set_branch_b(False)

async def click_center(page, loc):
    b = await loc.bounding_box(); await page.mouse.click(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)

async def open_report_dialog(page):
    await page.get_by_role("button", name="Chọn báo cáo").click(); await page.wait_for_timeout(600)
    return page.locator("[data-state=open][role=dialog]").last

async def run_report(page, name, *, bucket=None, store_all=False):
    dlg = await open_report_dialog(page)
    combos = dlg.locator("button[role=combobox]")
    if (await combos.first.inner_text()).strip() != name:
        await click_center(page, combos.first); await page.wait_for_timeout(500)
        await page.get_by_text(name, exact=True).last.click(); await page.wait_for_timeout(400)
        dlg = page.locator("[data-state=open][role=dialog]").last
    if bucket:
        await click_center(page, dlg.locator("button[role=combobox]").nth(1)); await page.wait_for_timeout(500)
        await page.get_by_text(bucket, exact=True).last.click(); await page.wait_for_timeout(400)
        dlg = page.locator("[data-state=open][role=dialog]").last
    if store_all:
        # The "Tất cả" radio renders checked while the filter is still unset — and
        # unset means "header branch" in the payload. Toggle it so `store` is sent.
        await dlg.locator("label", has_text="Theo nhóm cửa hàng").click(); await page.wait_for_timeout(300)
        await dlg.locator("label", has_text="Tất cả").first.click(); await page.wait_for_timeout(300)
    await dlg.get_by_label("Từ ngày").fill("2026-09-01")
    await dlg.get_by_label("Đến ngày").fill("2026-09-30")
    await dlg.get_by_role("button", name="Đồng ý").click()
    await page.wait_for_timeout(2000)

async def grid(scope):
    """Header names and, per body row, [(text, is_link)] for every cell."""
    hs = await scope.locator("table").first.locator("thead th").evaluate_all("ths => ths.map(th => th.textContent.trim())")
    rs = await scope.locator("table").first.locator("tbody tr").evaluate_all(
        "trs => trs.map(tr => Array.from(tr.querySelectorAll('td')).map(td => [td.textContent.trim(), !!td.querySelector('a, button')]))")
    return hs, [r for r in rs if r and any(c[0] for c in r)]

def col(hs, name):
    hs = [h for h in hs]
    return hs.index(name) if name in hs else -1

async def open_doc(scope, page, number):
    """Click the Số chứng từ cell with that number; return the new top dialog's text."""
    n_before = await page.locator("[data-state=open][role=dialog]").count()
    await scope.locator("table").first.locator("tbody td a, tbody td button", has_text=number).first.click()
    for _ in range(30):
        await page.wait_for_timeout(300)
        if await page.locator("[data-state=open][role=dialog]").count() > n_before:
            break
    await page.wait_for_timeout(800)
    return await page.locator("[data-state=open][role=dialog]").last.inner_text()

async def close_top(page):
    before = await page.locator("[data-state=open][role=dialog]").count()
    top = page.locator("[data-state=open][role=dialog]").last
    btn = top.get_by_role("button", name="Đóng", exact=True)
    if await btn.count(): await btn.last.click()
    else: await page.keyboard.press("Escape")
    await page.wait_for_timeout(700)
    return await page.locator("[data-state=open][role=dialog]").count() == before - 1

async def buttons_of_top(page):
    top = page.locator("[data-state=open][role=dialog]").last
    return [t.strip() for t in await top.locator("button").all_inner_texts() if t.strip()]

async def login(page):
    await page.goto(f"{BASE}/login", wait_until="networkidle")
    await page.fill("#login-org-id", ORG); await page.fill("#login-email", "admin@test.com"); await page.fill("#login-password", "password123")
    await page.click("button[type=submit]"); await page.wait_for_url(lambda u: "/login" not in u, timeout=20000)
    await page.goto(f"{BASE}/reports/cash-fund", wait_until="networkidle"); await page.wait_for_timeout(1200)

KIND_TITLE = {"Phiếu thu": "PHIẾU THU", "Phiếu chi": "PHIẾU CHI", "Thu tiền gửi": "THU TIỀN GỬI", "Chi tiền gửi": "CHI TIỀN GỬI"}

async def main():
    os.makedirs(OUT, exist_ok=True)
    orig, linked = setup()
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch()
            ctx = await b.new_context(viewport={"width": 1440, "height": 900}); page = await ctx.new_page()
            errs = []; page.on("console", lambda m: errs.append(m.text[:160]) if m.type == "error" else None)
            searches = []; page.on("request", lambda r: searches.append((r.headers.get("x-branch-id"), json.loads(r.post_data or "{}").get("filters"))) if "/reports/cash-fund/search" in r.url else None)
            forbidden = []; page.on("response", lambda r: forbidden.append(r.url.split("4055")[-1].split("?")[0]) if r.status == 403 else None)
            await login(page)

            # ---- #3 Bảng kê thu chi: AC-03 links, AC-01 four kinds, AC-05 other branch ----
            await run_report(page, "Bảng kê thu chi")
            hs, rs = await grid(page)
            ci, ck, cb = col(hs, "Số chứng từ"), col(hs, "Loại chứng từ"), col(hs, "Tên cửa hàng")
            print("   headers:", hs)
            cd, cin, cout = col(hs, "Ngày chứng từ"), col(hs, "Tiền thu"), col(hs, "Tiền chi")
            row_of = {r[ci][0]: r for r in rs if r[ci][0]}
            docs = [(r[ci][0], r[ck][0], r[cb][0] if cb >= 0 else "", r[ci][1]) for r in rs]
            print("   rows:", docs)
            opening = [d for d in docs if not d[0]]
            vouchers = [d for d in docs if d[0]]
            check("AC-03 every voucher row's Số chứng từ is a link", vouchers and all(d[3] for d in vouchers), str([d for d in vouchers if not d[3]]))
            check("AC-03 the Số dư đầu kỳ row has no link", opening and not any(c[1] for c in rs[0]), str(rs[0][:3]))
            kinds = {d[1] for d in vouchers}
            check("fixture has all four voucher kinds", set(KIND_TITLE) <= kinds, str(kinds))
            await page.screenshot(path=f"{OUT}/t0103-01-bang-ke-links.png", full_page=True)

            for i, kind in enumerate(KIND_TITLE, start=2):
                d = next((d for d in vouchers if d[1] == kind), None)
                if not d: check(f"AC-01 {kind} row present", False); continue
                text = await open_doc(page, page, d[0])
                btns = await buttons_of_top(page)
                r = row_of[d[0]]
                y, m, dd = r[cd][0].split("-")
                amount = r[cin][0] if r[cin][0] not in ("", "0") else r[cout][0]
                # Inputs don't contribute to innerText; read their values too.
                vals = await page.locator("[data-state=open][role=dialog]").last.locator("input").evaluate_all("is => is.map(i => i.value)")
                blob = await page.locator("[data-state=open][role=dialog]").last.inner_text() + " " + " ".join(vals)
                check(f"AC-01 {kind} {d[0]} dialog date and amount {amount} match the row ({r[cd][0]})",
                      (f"{dd}/{m}/{y}" in blob or r[cd][0] in vals) and amount in blob,
                      f"date in inputs={r[cd][0] in vals}; amount shown={amount in blob}; inputs={vals[:12]}")
                print(f"   {kind} {d[0]} dialog:", text[:160].replace("\n", " | "), "buttons:", btns)
                check(f"AC-01 {kind} {d[0]} opens its Sổ quỹ dialog showing that number", d[0] in text and KIND_TITLE[kind].lower() in text.lower(), text[:120].replace("\n", " | "))
                check(f"AC-01 {kind} dialog is read-only (no Sửa / Lưu)", not any(x in ("Sửa", "Lưu", "Lưu và đóng", "Cất") for x in btns), str(btns))
                await page.screenshot(path=f"{OUT}/t0103-{i:02d}-{kind.replace(' ', '-').lower()}.png")
                check(f"AC-01 closing the {kind} dialog returns to the report", await close_top(page))

            # AC-05: chain mode lists every branch; a voucher of a branch other than the
            # one the header was on still opens.
            header_branch = (await page.locator("button.w-52").inner_text()).strip()
            await page.locator("button.w-52").click(); await page.wait_for_timeout(500)
            await page.locator('[role="menuitemradio"]', has_text="Chuỗi cửa hàng").click()
            await page.wait_for_timeout(2500)
            await page.goto(f"{BASE}/reports/cash-fund", wait_until="networkidle"); await page.wait_for_timeout(1200)
            await run_report(page, "Bảng kê thu chi", store_all=True)
            hs, rs = await grid(page)
            ci, cb = col(hs, "Số chứng từ"), col(hs, "Tên cửa hàng")
            other = next(((r[ci][0], r[cb][0]) for r in rs if r[ci][0] and r[cb][0] and r[cb][0] != header_branch), None)
            print("   search filters:", searches[-1])
            print("   header branch:", header_branch, "other-branch row:", other)
            if other:
                text = await open_doc(page, page, other[0])
                check(f"AC-05 chain mode: voucher of another branch ({other[0]} @ {other[1]}, header was {header_branch}) opens", other[0] in text, text[:120].replace("\n", " | "))
                await page.screenshot(path=f"{OUT}/t0103-06-chi-nhanh-khac.png")
                await close_top(page)
            else:
                check("AC-05 chain mode lists a voucher of another branch", False, str([r[cb][0] for r in rs]))

            # ---- AC-07: POS receipt → source invoice ----
            if linked:
                text = await open_doc(page, page, "PT000002")
                top = page.locator("[data-state=open][role=dialog]").last
                link = top.locator("a, button", has_text="HD-A1")
                check("AC-07 PT000002 dialog shows source invoice HD-A1 as a link", await link.count() > 0, text[:300].replace("\n", " | "))
                if await link.count():
                    await link.first.click(); await page.wait_for_timeout(2000)
                    inv = await page.locator("[data-state=open][role=dialog]").last.inner_text()
                    check("AC-07 clicking it opens Chi tiết hóa đơn HD-A1", "hóa đơn" in inv.lower() and "HD-A1" in inv, inv[:160].replace("\n", " | "))
                    await page.screenshot(path=f"{OUT}/t0103-07-hoa-don-nguon.png")
                    await close_top(page)
                await close_top(page)
            else:
                check("AC-07 invoice HD-A1 present in erp_test (run cash-fund-report-list e2e first)", False)

            # ---- #5 Bảng kê tiền chi theo mục chi: AC-02 ----
            await run_report(page, "Bảng kê tiền chi theo mục chi")
            hs, rs = await grid(page)
            ci = col(hs, "Số chứng từ")
            detail = [r for r in rs if r[ci][0]]
            nondetail = [r for r in rs if not r[ci][0]]
            check("AC-02 every detail line's Số chứng từ is a link", detail and all(r[ci][1] for r in detail), str([r[ci] for r in detail]))
            check("AC-02 TỔNG CHI / group rows have no link", nondetail and not any(c[1] for r in nondetail for c in r), str([r[0] for r in nondetail]))
            num = detail[0][ci][0]
            text = await open_doc(page, page, num)
            check(f"AC-02 {num} opens the Phiếu chi dialog", num in text and "phiếu chi" in text.lower(), text[:120].replace("\n", " | "))
            await page.screenshot(path=f"{OUT}/t0103-08-bang-ke-muc-chi.png")
            await close_top(page)

            # ---- AC-04: from drill-down dialogs of #2, #4, #6 ----
            async def via_drilldown(label, run, pick, shot):
                await run()
                main_table = page.locator("table").first
                links = main_table.locator("tbody td a, tbody td button")
                target = await pick(main_table)
                if target is None:
                    check(f"AC-04 {label}: drill-down link found", False); return
                await target.click(); await page.wait_for_timeout(2500)
                dd = page.locator("[data-state=open][role=dialog]").last
                hs2, rs2 = await grid(dd)
                ci2 = col(hs2, "Số chứng từ")
                nums = [r[ci2][0] for r in rs2 if ci2 >= 0 and r[ci2][0] and r[ci2][1]]
                if not nums:
                    check(f"AC-04 {label}: drill-down dialog has linked Số chứng từ", False, str(hs2)); return
                text = await open_doc(dd, page, nums[0])
                check(f"AC-04 {label}: {nums[0]} opens on top of the drill-down", nums[0] in text and await page.locator("[data-state=open][role=dialog]").count() >= 2, text[:100].replace("\n", " | "))
                await page.screenshot(path=f"{OUT}/{shot}")
                closed = await close_top(page)
                still = await page.locator("[data-state=open][role=dialog]").count()
                check(f"AC-04 {label}: closing the voucher returns to the drill-down dialog", closed and still >= 1)
                await close_top(page)

            async def pick_iv(t):
                row = t.locator("tbody tr", has_text="IV.").first
                return row.locator("td").nth(1).locator("a, button").first if await row.count() else None
            async def pick_first_link(t):
                l = t.locator("tbody td a, tbody td button")
                return l.first if await l.count() else None

            await via_drilldown("#2 Tình hình thu chi → IV Tiền mặt", lambda: run_report(page, "Tình hình thu chi"), pick_iv, "t0103-09-drilldown-tinh-hinh.png")
            await via_drilldown("#4 Chi tiền theo mục chi → Mục chi", lambda: run_report(page, "Chi tiền theo mục chi"), pick_first_link, "t0103-10-drilldown-muc-chi.png")
            await via_drilldown("#6 Chi tiền theo thời gian → Ngày", lambda: run_report(page, "Chi tiền theo thời gian", bucket="Ngày"), pick_first_link, "t0103-11-drilldown-thoi-gian.png")
            KNOWN_403 = {"/v2/cash-voucher-categories/tree", "/deposit/dashboard", "/admin/entities/deposit-accounts/records"}
            print("   403 responses (treasury dialogs' own lookups; fixture admin lacks those reads):", sorted(set(forbidden)))
            known = [e for e in errs if "403 (Forbidden)" in e or ('unique "key" prop' in e and "ReceiptVou" in e)]
            print("   known console noise (403s above + pre-existing key warning in ReceiptVoucherDialog):", len(known))
            check("403s come only from the reused treasury dialogs' lookups", set(forbidden) <= KNOWN_403, str(sorted(set(forbidden) - KNOWN_403)))
            check("no other console errors", len(errs) == len(known), str([e for e in errs if e not in known][:3]))
            await ctx.close()

            # ---- AC-06: without accounting.cash_payment.read ----
            ctx = await b.new_context(viewport={"width": 1440, "height": 900}); page = await ctx.new_page()
            await page.add_init_script("""
              const set = Storage.prototype.setItem;
              Storage.prototype.setItem = function (k, v) {
                if (k === 'user_permissions') { try { v = JSON.stringify(JSON.parse(v).filter(p => p !== 'accounting.cash_payment.read')); } catch (e) {} }
                return set.call(this, k, v);
              };
            """)
            await login(page)
            perms = await page.evaluate("JSON.parse(localStorage.getItem('user_permissions') || '[]')")
            check("AC-06 setup: session lacks accounting.cash_payment.read, keeps reporting.cash.read",
                  "accounting.cash_payment.read" not in perms and "reporting.cash.read" in perms, f"{len(perms)} perms")
            await run_report(page, "Bảng kê thu chi")
            hs, rs = await grid(page)
            ci, ck = col(hs, "Số chứng từ"), col(hs, "Loại chứng từ")
            pcs = [r[ci] for r in rs if r[ck][0] == "Phiếu chi"]
            others = [r[ci] for r in rs if r[ci][0] and r[ck][0] != "Phiếu chi"]
            check("AC-06 Phiếu chi numbers are plain text", pcs and not any(c[1] for c in pcs), str(pcs))
            check("AC-06 other voucher kinds are still links", others and all(c[1] for c in others), str(others))
            await page.screenshot(path=f"{OUT}/t0103-12-thieu-quyen.png", full_page=True)
            await b.close()
    finally:
        restore(orig)
    print("\n" + ("ALL PASS" if not failures else f"{len(failures)} FAILED: {failures}"))
    sys.exit(1 if failures else 0)

asyncio.run(main())
