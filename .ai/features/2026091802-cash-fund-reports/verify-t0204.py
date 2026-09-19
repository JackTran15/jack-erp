"""T-02-04: IV Tiền mặt / Tiền gửi cells of "Tình hình thu chi" drill into "Bảng kê thu chi"."""
import asyncio, os, sys
from playwright.async_api import async_playwright

BASE = os.environ.get("FE_URL", "http://localhost:3005")
OUT = os.path.join(os.path.dirname(__file__), "evidence")
ORG = "a0000000-0000-4000-8000-000000000001"
failures = []

def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not ok: failures.append(name)

async def click_center(page, loc):
    b = await loc.bounding_box(); await page.mouse.click(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)

async def rows(scope):
    r = await scope.locator("table tbody tr").evaluate_all("trs => trs.map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim()))")
    return [x for x in r if x and any(x)]

async def run_tinh_hinh(page):
    await page.get_by_role("button", name="Chọn báo cáo").click(); await page.wait_for_timeout(600)
    dlg = page.locator("[data-state=open][role=dialog]").last
    combo = dlg.locator("button[role=combobox]").first
    if (await combo.inner_text()).strip() != "Tình hình thu chi":
        await click_center(page, combo); await page.wait_for_timeout(500)
        await page.get_by_text("Tình hình thu chi", exact=True).last.click(); await page.wait_for_timeout(400)
        dlg = page.locator("[data-state=open][role=dialog]").last
    await dlg.get_by_label("Từ ngày").fill("2026-09-01")
    await dlg.get_by_label("Đến ngày").fill("2026-09-30")
    await dlg.get_by_role("button", name="Đồng ý").click()
    await page.wait_for_timeout(1800)

async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1440, "height": 900}); page = await ctx.new_page()
        errs = []; page.on("console", lambda m: errs.append(m.text[:160]) if m.type == "error" else None)
        searches = []
        page.on("request", lambda r: searches.append((r.url.split("/reports/")[1], (r.post_data or "")[:200])) if r.method == "POST" and "/reports/cash-fund/" in r.url and "search" in r.url else None)
        await page.goto(f"{BASE}/login", wait_until="networkidle")
        await page.fill("#login-org-id", ORG); await page.fill("#login-email", "admin@test.com"); await page.fill("#login-password", "password123")
        await page.click("button[type=submit]")
        try:
            await page.wait_for_url(lambda u: "/login" not in u, timeout=20000)
        except Exception:
            await page.screenshot(path=f"{OUT}/t0204-login-fail.png"); print("LOGIN FAIL:", (await page.inner_text("body"))[:400]); raise
        await page.goto(f"{BASE}/reports/cash-fund", wait_until="networkidle"); await page.wait_for_timeout(1200)
        await run_tinh_hinh(page)
        check("title is TÌNH HÌNH THU CHI", "TÌNH HÌNH THU CHI" in await page.inner_text("body"))

        main_table = page.locator("table").first
        r = await rows(page)
        print("   rows:", [x[0] for x in r])
        # links in the main table
        links = await main_table.locator("tbody a").evaluate_all("as => as.map(a => [a.closest('tr').querySelector('td').textContent.trim(), a.textContent.trim()])")
        print("   links:", links)
        iv_links = [l for l in links if l[0].startswith("IV")]
        other_links = [l for l in links if not l[0].startswith("IV")]
        check("only the IV row has clickable cells", len(iv_links) == 2 and not other_links, str(links))
        iv_row = main_table.locator("tbody tr", has_text="IV.").first
        iv_cells = await iv_row.locator("td").evaluate_all("tds => tds.map(td => [td.textContent.trim(), !!td.querySelector('a')])")
        check("IV row: cash + deposit are links, total is not", [c[1] for c in iv_cells] == [False, True, True, False], str(iv_cells))
        await page.screenshot(path=f"{OUT}/t0204-01-tinh-hinh.png", full_page=True)

        n_before = len(searches)
        # click IV Tiền mặt
        await iv_row.locator("td").nth(1).locator("a").click(); await page.wait_for_timeout(2500)
        dlg = page.locator("[data-state=open][role=dialog]").last
        dtext = await dlg.inner_text()
        check("dialog title BẢNG KÊ THU CHI", "BẢNG KÊ THU CHI" in dtext, dtext[:120].replace("\n", " | "))
        check("subtitle: Phương thức thanh toán Tiền mặt Từ 01/09/2026 đến 30/09/2026",
              "Phương thức thanh toán Tiền mặt" in dtext and "01/09/2026" in dtext and "30/09/2026" in dtext, dtext[:300].replace("\n", " | "))
        dr = await rows(dlg)
        check("cash dialog: opening row + 8 voucher rows", len(dr) >= 1 and "Số dư đầu kỳ" in " ".join(dr[0]) and len(dr) - 1 == 8, f"{len(dr) - 1} voucher rows")
        methods = set(c for row in dr[1:] for c in row if c in ("Tiền mặt", "Chuyển khoản"))
        check("cash dialog: all rows Tiền mặt", methods == {"Tiền mặt"}, str(methods))
        await page.screenshot(path=f"{OUT}/t0204-02-dialog-tien-mat.png", full_page=True)
        await dlg.get_by_role("button", name="Đóng", exact=True).last.click(); await page.wait_for_timeout(800)
        check("dialog closed", await page.locator("[data-state=open][role=dialog]").count() == 0)
        r2 = await rows(page)
        check("parent report unchanged after close", r2 == r, f"{len(r2)} rows")
        cash_searches = [u for u in searches[n_before:]]
        check("closing the dialog did not re-query the parent (only cash-in-out-list searches since click)",
              len(cash_searches) >= 1 and all("cash-in-out-list" in b for _, b in cash_searches), str(cash_searches))

        # click IV Tiền gửi
        n_before = len(searches)
        iv_row = page.locator("table").first.locator("tbody tr", has_text="IV.").first
        await iv_row.locator("td").nth(2).locator("a").click(); await page.wait_for_timeout(2500)
        dlg = page.locator("[data-state=open][role=dialog]").last
        dtext = await dlg.inner_text()
        check("deposit dialog subtitle Chuyển khoản", "BẢNG KÊ THU CHI" in dtext and "Phương thức thanh toán Chuyển khoản" in dtext, dtext[:200].replace("\n", " | "))
        dr = await rows(dlg)
        check("deposit dialog: 1 voucher row (fixture PTG-01 = NTTK000001, 1.600.000, Chuyển khoản)", len(dr) - 1 == 1 and "1.600.000" in dr[1] and "Chuyển khoản" in dr[1], str(dr[1:]))
        await page.screenshot(path=f"{OUT}/t0204-03-dialog-tien-gui.png", full_page=True)
        await dlg.get_by_role("button", name="Đóng", exact=True).last.click(); await page.wait_for_timeout(800)
        r3 = await rows(page)
        check("parent unchanged after second close", r3 == r)
        print("   searches since deposit click:", searches[n_before:])
        check("no console errors", not errs, str(errs[:2]))
        await b.close()
    print("\n" + ("ALL PASS" if not failures else f"{len(failures)} FAILED: {failures}"))
    sys.exit(1 if failures else 0)

asyncio.run(main())
