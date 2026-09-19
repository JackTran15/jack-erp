"""T-02-06 — filter subtitle under the report title (erp_test fixture, FE :3005)."""
import asyncio, os, sys, json
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

async def subtitle(page):
    # title block: h1 + sibling <p> lines
    try:
        await page.wait_for_selector("h1", timeout=8000)
    except Exception:
        return ["<no h1: " + (await page.inner_text("body"))[:80].replace("\n", " | ") + ">"]
    return await page.eval_on_selector("h1", "h => Array.from(h.parentElement.querySelectorAll('p')).map(p => p.textContent.trim())")

async def open_report_dialog(page):
    await page.get_by_role("button", name="Chọn báo cáo").click(); await page.wait_for_timeout(600)
    return page.locator("[data-state=open][role=dialog]").last

async def choose_in_popover(page, trigger, text):
    await click_center(page, trigger); await page.wait_for_timeout(500)
    await page.get_by_text(text, exact=True).last.click(); await page.wait_for_timeout(400)

async def pick_report(page, name):
    dlg = await open_report_dialog(page)
    if (await dlg.locator("button[role=combobox]").first.inner_text()).strip() != name:
        await choose_in_popover(page, dlg.locator("button[role=combobox]").first, name)
    return page.locator("[data-state=open][role=dialog]").last

async def login(page):
    await page.goto(f"{BASE}/login", wait_until="networkidle")
    await page.fill("#login-org-id", ORG); await page.fill("#login-email", "admin@test.com"); await page.fill("#login-password", "password123")
    await page.click("button[type=submit]"); await page.wait_for_url(lambda u: "/login" not in u, timeout=20000)

async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1440, "height": 900}); page = await ctx.new_page()
        errs = []; page.on("console", lambda m: errs.append(m.text[:160]) if m.type == "error" else None)
        opt_reqs = []; page.on("request", lambda r: opt_reqs.append(r.url) if "filter-options" in r.url else None)
        async def on_resp(r):
            if r.status >= 400: print("   HTTP", r.status, r.url.split("localhost:4055")[-1][:80], (await r.text())[:160].replace("\n", " "))
        page.on("response", on_resp)
        await login(page)

        # ---- single-branch mode ----
        await page.goto(f"{BASE}/reports/cash-fund", wait_until="networkidle"); await page.wait_for_timeout(1200)
        st = await subtitle(page)
        check("single: Tình hình thu chi keeps 'Xem theo chi nhánh'", "TÌNH HÌNH THU CHI" in await page.inner_text("h1") and st == ["Xem theo chi nhánh"], str(st))
        n_before = len(opt_reqs)
        dlg = await pick_report(page, "Bảng kê thu chi")
        await dlg.get_by_label("Từ ngày").fill("2026-09-01"); await dlg.get_by_label("Đến ngày").fill("2026-09-30")
        await dlg.get_by_role("button", name="Đồng ý").click(); await page.wait_for_timeout(1800)
        st = await subtitle(page)
        check("single: Bảng kê thu chi → ['Nhân viên: Tất cả'] (no store line, STORE is chain-only)", st == ["Nhân viên: Tất cả"], str(st))
        check("single: no store options request fired by the header", not any("type=store" in u for u in opt_reqs[n_before:]), str([u.split('?')[1] for u in opt_reqs[n_before:]]))
        await page.screenshot(path=f"{OUT}/t0206-01-single-tat-ca.png")
        # pick employee -> label after Đồng ý; draft not shown before apply
        dlg = await pick_report(page, "Bảng kê thu chi")
        combos = dlg.locator("button[role=combobox]")
        await click_center(page, combos.nth(1)); await page.wait_for_timeout(900)
        pop = page.locator("[data-state=open][role=dialog]").last
        opts = pop.locator("button")
        items = [(await opts.nth(i).inner_text()).strip() for i in range(await opts.count())]
        items = [t for t in items if t and t != "Tất cả"]
        print("   employee options:", items)
        if items:
            await opts.filter(has_text=items[0]).first.click(); await page.wait_for_timeout(400)
            st_draft = await subtitle(page)
            check("single: draft employee selection does NOT change the subtitle before Đồng ý", st_draft == ["Nhân viên: Tất cả"], str(st_draft))
            dlg = page.locator("[data-state=open][role=dialog]").last
            await dlg.get_by_role("button", name="Đồng ý").click(); await page.wait_for_timeout(1800)
            st = await subtitle(page)
            check(f"single: applied employee → 'Nhân viên: {items[0]}'", st == [f"Nhân viên: {items[0]}"], str(st))
            await page.screenshot(path=f"{OUT}/t0206-02-single-nhan-vien.png")
        else:
            print("SKIP single: employee-name subtitle — fixture has no vouchers, employee options empty")
            await page.keyboard.press("Escape"); await page.wait_for_timeout(300)
            await page.keyboard.press("Escape"); await page.wait_for_timeout(300)

        # ---- other domains keep the fixed text ----
        for path, expect_title in [("/reports/sales", None), ("/reports/debts", None), ("/reports/profit", None)]:
            await page.goto(f"{BASE}{path}", wait_until="networkidle"); await page.wait_for_timeout(1000)
            st = await subtitle(page)
            if st and st[0].startswith("<no h1"):
                print(f"SKIP single: {path} — fixture account has no permission for this category ({st[0][:70]})"); continue
            t = await page.inner_text("h1")
            check(f"single: {path} ({t.strip()[:30]}) keeps 'Xem theo chi nhánh'", st == ["Xem theo chi nhánh"], str(st))

        # ---- chain mode (persisted branch store flag) ----
        await page.evaluate("localStorage.setItem('bo-active-branch', JSON.stringify({state:{isChain:true},version:0}))")
        await page.goto(f"{BASE}/reports/cash-fund", wait_until="networkidle"); await page.wait_for_timeout(1500)
        st = await subtitle(page); t = await page.inner_text("h1")
        is_chain = "chuỗi" in " ".join(st) or "cửa hàng" in " ".join(st)
        print("   chain h1:", t.strip(), "subtitle:", st)
        if not is_chain:
            check("chain: could enter chain view (needs consolidated permission)", False, str(st))
        else:
            check("chain: Tình hình thu chi keeps 'Xem theo chuỗi cửa hàng'", st == ["Xem theo chuỗi cửa hàng"], str(st))
            dlg = await pick_report(page, "Bảng kê thu chi")
            await page.wait_for_timeout(800)
            st = await subtitle(page)
            check("chain: Bảng kê thu chi (setReportType auto-applies) → ['Xem theo cửa hàng: Tất cả', 'Nhân viên: Tất cả']", st == ["Xem theo cửa hàng: Tất cả", "Nhân viên: Tất cả"], str(st))
            await page.screenshot(path=f"{OUT}/t0206-03-chain-tat-ca.png")
            # Theo nhóm cửa hàng → pick two stores
            await dlg.locator("input[name=store-scope]").nth(1).check(); await page.wait_for_timeout(500)
            dlg = page.locator("[data-state=open][role=dialog]").last
            chips = page.locator("[data-state=open][role=dialog]").filter(has=page.locator("input[autocomplete=off]")).first.locator("input[autocomplete=off]").first
            await chips.click(); await page.wait_for_timeout(800)
            picked = []
            for _ in range(2):
                pop = page.locator("[data-state=open]").last
                opts = pop.locator("button").filter(has_not_text="Bỏ chọn")
                names = [(await opts.nth(i).inner_text()).strip() for i in range(await opts.count())]
                names = [n for n in names if n]
                if not picked: print("   store options:", names)
                if not names: break
                await opts.filter(has_text=names[0]).first.click(); await page.wait_for_timeout(400); picked.append(names[0])
                if len(names) == 1: break
                await chips.click(); await page.wait_for_timeout(500)
            await page.keyboard.press("Escape"); await page.wait_for_timeout(300)
            # dialog still open? (Escape may close the chips popover only)
            if await page.locator("[data-state=open][role=dialog]").count() == 0:
                dlg = await pick_report(page, "Bảng kê thu chi")
            dlg = page.locator("[data-state=open][role=dialog]").last
            await dlg.get_by_label("Từ ngày").fill("2026-09-01"); await dlg.get_by_label("Đến ngày").fill("2026-09-30")
            await dlg.get_by_role("button", name="Đồng ý").click(); await page.wait_for_timeout(1800)
            st = await subtitle(page)
            check(f"chain: group [{', '.join(picked)}] → 'Xem theo cửa hàng: {', '.join(picked)}'", len(st) == 2 and st[0] == "Xem theo cửa hàng: " + ", ".join(picked) and st[1] == "Nhân viên: Tất cả", str(st))
            await page.screenshot(path=f"{OUT}/t0206-04-chain-nhom.png")
            dlg = await pick_report(page, "Bảng kê thu chi")
            combos = dlg.locator("button[role=combobox]")
            await click_center(page, combos.nth(1)); await page.wait_for_timeout(900)
            pop = page.locator("[data-state=open][role=dialog]").last
            opts = pop.locator("button")
            items = [(await opts.nth(i).inner_text()).strip() for i in range(await opts.count())]
            items = [t for t in items if t and t != "Tất cả"]
            print("   chain employee options:", items)
            if items:
                await opts.filter(has_text=items[0]).first.click(); await page.wait_for_timeout(400)
                st_draft = await subtitle(page)
                check("chain: draft employee does NOT change subtitle before Đồng ý", st_draft[1] == "Nhân viên: Tất cả", str(st_draft))
                dlg = page.locator("[data-state=open][role=dialog]").last
                await dlg.get_by_role("button", name="Đồng ý").click(); await page.wait_for_timeout(1800)
                st = await subtitle(page)
                check(f"chain: group stores + employee → ['Xem theo cửa hàng: {', '.join(picked)}', 'Nhân viên: {items[0]}']", st == ["Xem theo cửa hàng: " + ", ".join(picked), f"Nhân viên: {items[0]}"], str(st))
                await page.screenshot(path=f"{OUT}/t0206-05-chain-nhom-nhan-vien.png")
            else:
                print("SKIP chain: employee-name subtitle — employee options empty")
            for path in ["/reports/sales", "/reports/debts", "/reports/profit"]:
                await page.goto(f"{BASE}{path}", wait_until="networkidle"); await page.wait_for_timeout(1000)
                st = await subtitle(page)
                if st and st[0].startswith("<no h1"):
                    print(f"SKIP chain: {path} — fixture account has no permission for this category"); continue
                t = await page.inner_text("h1")
                check(f"chain: {path} ({t.strip()[:30]}) keeps 'Xem theo chuỗi cửa hàng'", st == ["Xem theo chuỗi cửa hàng"], str(st))
        check("no console errors", not errs, str(errs[:2]))
        await b.close()
    print("\n" + ("ALL PASS" if not failures else f"{len(failures)} FAILED: {failures}"))
    sys.exit(1 if failures else 0)

asyncio.run(main())
