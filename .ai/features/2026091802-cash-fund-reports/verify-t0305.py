"""T-03-05 browser boxes: drill-down from #4 (Mục chi) and #6 (Ngày) into #5 "Bảng kê tiền chi theo mục chi" (same setup as verify-t0304.py)."""
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

async def rows_in(scope):
    r = await scope.locator("table tbody tr").evaluate_all("trs => trs.map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim()))")
    return [x for x in r if x and any(x)]

async def headers_in(scope):
    return await scope.locator("table thead th").evaluate_all("ths => ths.map(th => th.textContent.trim()).filter(Boolean)")

async def footer_in(scope):
    return await scope.locator("table tfoot td, table tfoot th").evaluate_all("els => els.map(e => e.textContent.trim())")

async def open_report_dialog(page):
    await page.get_by_role("button", name="Chọn báo cáo").click(); await page.wait_for_timeout(600)
    return page.locator("[data-state=open][role=dialog]").last

async def choose_in_popover(page, trigger, text):
    await click_center(page, trigger); await page.wait_for_timeout(500)
    await page.get_by_text(text, exact=True).last.click(); await page.wait_for_timeout(400)

async def run_report(page, name, *, bucket=None, category_text=None):
    dlg = await open_report_dialog(page)
    combos = dlg.locator("button[role=combobox]")
    if (await combos.first.inner_text()).strip() != name:
        await choose_in_popover(page, combos.first, name)
        dlg = page.locator("[data-state=open][role=dialog]").last
    combos = dlg.locator("button[role=combobox]")
    if bucket:
        await choose_in_popover(page, combos.nth(1), bucket)
        dlg = page.locator("[data-state=open][role=dialog]").last
        combos = dlg.locator("button[role=combobox]")
    if category_text:
        await click_center(page, combos.nth(2)); await page.wait_for_timeout(900)
        pop = page.locator("[data-state=open][role=dialog]").last
        await pop.get_by_text(category_text, exact=True).click(); await page.wait_for_timeout(400)
        dlg = page.locator("[data-state=open][role=dialog]").last
    await dlg.get_by_label("Từ ngày").fill("2026-09-01")
    await dlg.get_by_label("Đến ngày").fill("2026-09-30")
    await dlg.get_by_role("button", name="Đồng ý").click()
    await page.wait_for_timeout(1800)

async def open_drilldown(page, link_text):
    """Click a link cell in the page table; return the drill-down dialog locator."""
    link = page.locator("table tbody a", has_text=link_text).first
    await link.click(); await page.wait_for_timeout(2000)
    return page.locator("[data-state=open][role=dialog]").last

def group_names(r):
    return [next(c for c in x if c in ("Chi khác", "Tiền điện", "Tiền nước")) for x in r
            if not any(c.startswith("PC") for c in x) and any(c in ("Chi khác", "Tiền điện", "Tiền nước") for c in x)]

def detail_docs(r):
    return [next(c for c in x if c.startswith("PC")) for x in r if any(c.startswith("PC") for c in x)]

async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1440, "height": 900}); page = await ctx.new_page()
        errs = []; page.on("console", lambda m: errs.append(m.text[:160]) if m.type == "error" else None)
        net = []; page.on("response", lambda r: net.append((r.status, r.url)) if "/reports/cash-fund" in r.url else None)
        await page.goto(f"{BASE}/login", wait_until="networkidle")
        await page.fill("#login-org-id", ORG); await page.fill("#login-email", "admin@test.com"); await page.fill("#login-password", "password123")
        await page.click("button[type=submit]"); await page.wait_for_url(lambda u: "/login" not in u, timeout=20000)
        await page.goto(f"{BASE}/reports/cash-fund", wait_until="networkidle"); await page.wait_for_timeout(1200)

        # ---- AC-13: #4 "Tiền điện" → #5 with only the Tiền điện group ----
        await run_report(page, "Chi tiền theo mục chi")
        check("#4 loaded", "CHI TIỀN THEO MỤC CHI" in await page.inner_text("body"))
        links = await page.locator("table tbody a").evaluate_all("as => as.map(a => a.textContent.trim())")
        check("#4 Mục chi cells are links (Tiền điện / Chi khác / Tiền nước)", sorted(links) == sorted(["Tiền điện", "Chi khác", "Tiền nước"]), str(links))
        dlg = await open_drilldown(page, "Tiền điện")
        txt = await dlg.inner_text()
        check("AC-13 dialog title BẢNG KÊ TIỀN CHI THEO MỤC CHI", "BẢNG KÊ TIỀN CHI THEO MỤC CHI" in txt, txt[:120].replace("\n", " | "))
        check("AC-13 subtitle 'Mục chi Tiền điện Từ 01/09/2026 đến 30/09/2026'", "Mục chi Tiền điện Từ 01/09/2026 đến 30/09/2026" in txt, txt[:200].replace("\n", " | "))
        r = await rows_in(dlg)
        print("   rows:", [" | ".join(x) for x in r])
        check("AC-13 first row TỔNG CHI = 150.000", bool(r) and any("TỔNG CHI" in c for c in r[0]) and "150.000" in r[0], str(r[:1]))
        check("AC-13 one group: Tiền điện", group_names(r) == ["Tiền điện"], str(group_names(r)))
        check("AC-13 details PC-02=PC000002 (90.000) and PC-03=PC000003 (60.000)", sorted(detail_docs(r)) == ["PC000002", "PC000003"] and any("90.000" in x for x in r) and any("60.000" in x for x in r), str(detail_docs(r)))
        check("AC-13 footer 150.000", "150.000" in await footer_in(dlg), str(await footer_in(dlg)))
        await page.screenshot(path=f"{OUT}/t0305-01-tien-dien.png", full_page=True)
        await dlg.get_by_role("button", name="Đóng", exact=True).last.click(); await page.wait_for_timeout(600)

        # ---- #4 "Chi khác" (uncategorized) → #5 with only the no-category group ----
        dlg = await open_drilldown(page, "Chi khác")
        txt = await dlg.inner_text()
        check("Chi khác subtitle 'Mục chi Chi khác Từ … đến …'", "Mục chi Chi khác Từ 01/09/2026 đến 30/09/2026" in txt, txt[:200].replace("\n", " | "))
        r = await rows_in(dlg)
        print("   rows:", [" | ".join(x) for x in r])
        check("Chi khác: TỔNG CHI = 40.000", bool(r) and any("TỔNG CHI" in c for c in r[0]) and "40.000" in r[0], str(r[:1]))
        check("Chi khác: one group Chi khác, one detail PC-04=PC000004", group_names(r) == ["Chi khác"] and detail_docs(r) == ["PC000004"], f"{group_names(r)} {detail_docs(r)}")
        await page.screenshot(path=f"{OUT}/t0305-02-chi-khac.png", full_page=True)
        await dlg.get_by_role("button", name="Đóng", exact=True).last.click(); await page.wait_for_timeout(600)

        # ---- AC-18: #6 (Ngày) 08/09/2026 → #5 from = to = 08/09, Mục chi = Tất cả ----
        await run_report(page, "Chi tiền theo thời gian", bucket="Ngày")
        check("#6 loaded", "CHI TIỀN THEO THỜI GIAN" in await page.inner_text("body"))
        dlg = await open_drilldown(page, "08/09/2026")
        txt = await dlg.inner_text()
        check("AC-18 dialog title BẢNG KÊ TIỀN CHI THEO MỤC CHI", "BẢNG KÊ TIỀN CHI THEO MỤC CHI" in txt, txt[:120].replace("\n", " | "))
        check("AC-18 subtitle 'Mục chi Tất cả Từ 08/09/2026 đến 08/09/2026'", "Mục chi Tất cả Từ 08/09/2026 đến 08/09/2026" in txt, txt[:200].replace("\n", " | "))
        r = await rows_in(dlg)
        print("   rows:", [" | ".join(x) for x in r])
        check("AC-18 TỔNG CHI = 100.000", bool(r) and any("TỔNG CHI" in c for c in r[0]) and "100.000" in r[0], str(r[:1]))
        check("AC-18 two groups Tiền điện / Tiền nước", group_names(r) == ["Tiền điện", "Tiền nước"], str(group_names(r)))
        check("AC-18 two detail lines, both PC-02=PC000002", detail_docs(r) == ["PC000002", "PC000002"], str(detail_docs(r)))
        hs = await headers_in(dlg)
        idx = {h: i for i, h in enumerate(hs)}
        dates = {x[idx["Ngày chứng từ"]] for x in r if any(c.startswith("PC") for c in x)} if "Ngày chứng từ" in idx else set()
        # #5 renders "Ngày chứng từ" as the raw ISO value (T-03-04 rendering, not this ticket) — accept both.
        check("AC-18 every detail dated 08/09/2026", dates in ({"08/09/2026"}, {"2026-09-08"}), str(dates))
        await page.screenshot(path=f"{OUT}/t0305-03-ngay-08-09.png", full_page=True)
        await dlg.get_by_role("button", name="Đóng", exact=True).last.click(); await page.wait_for_timeout(600)

        # ---- AC-18 keeps the Mục chi being filtered: #6 with Mục chi = Tiền điện, click 08/09 ----
        await run_report(page, "Chi tiền theo thời gian", bucket="Ngày", category_text="Tiền điện")
        dlg = await open_drilldown(page, "08/09/2026")
        txt = await dlg.inner_text()
        check("AC-18 (filtered) subtitle 'Mục chi đang lọc Từ 08/09/2026 đến 08/09/2026'", "Mục chi đang lọc Từ 08/09/2026 đến 08/09/2026" in txt, txt[:200].replace("\n", " | "))
        r = await rows_in(dlg)
        print("   rows:", [" | ".join(x) for x in r])
        check("AC-18 (filtered) TỔNG CHI = 90.000, only Tiền điện group, one PC-02 line",
              bool(r) and "90.000" in r[0] and group_names(r) == ["Tiền điện"] and detail_docs(r) == ["PC000002"], f"{r[:1]} {group_names(r)} {detail_docs(r)}")
        await page.screenshot(path=f"{OUT}/t0305-04-ngay-08-09-tien-dien.png", full_page=True)
        await dlg.get_by_role("button", name="Đóng", exact=True).last.click(); await page.wait_for_timeout(400)

        bad = [(s, u) for s, u in net if s >= 400]
        check("no non-2xx cash-fund calls", not bad, str(bad))
        print("   console errors:", errs[:5])
        await b.close()
    print("\nFAILURES:" if failures else "\nALL PASS", failures)
    sys.exit(1 if failures else 0)

asyncio.run(main())
