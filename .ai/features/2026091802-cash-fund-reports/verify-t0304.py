"""T-03-04 browser boxes for the three expense reports on the erp_test fixture (same setup as verify-t0203.py)."""
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

async def rows(page):
    r = await page.eval_on_selector_all("table tbody tr", "trs => trs.map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim()))")
    return [x for x in r if x and any(x)]

async def row_styles(page):
    # per row: [is bold anywhere, max padding-left of first cell content]
    return await page.eval_on_selector_all("table tbody tr", """trs => trs.map(tr => {
        const tds = Array.from(tr.querySelectorAll('td'));
        const bold = tds.some(td => { const w = getComputedStyle(td).fontWeight; return w === 'bold' || parseInt(w) >= 600 || td.querySelector('b,strong,.font-bold,.font-semibold'); });
        const first = tds[0]; const inner = first ? (first.querySelector('div,span') || first) : null;
        const pl = inner ? parseFloat(getComputedStyle(inner).paddingLeft || '0') + parseFloat(getComputedStyle(inner).marginLeft || '0') : 0;
        return [bold, pl, tr.className];
    })""")

async def headers(page):
    return await page.eval_on_selector_all("table thead th", "ths => ths.map(th => th.textContent.trim()).filter(Boolean)")

async def footer(page):
    return await page.eval_on_selector_all("table tfoot td, table tfoot th", "els => els.map(e => e.textContent.trim())")

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
    labels = (await dlg.inner_text()).replace("\n", " | ")
    combos = dlg.locator("button[role=combobox]")
    n = await combos.count()
    combo_texts = [(await combos.nth(i).inner_text()).strip() for i in range(n)]
    if bucket:
        # combo 1 is "Thống kê theo" on #6
        await choose_in_popover(page, combos.nth(1), bucket)
        dlg = page.locator("[data-state=open][role=dialog]").last
    if category_text:
        idx = 2 if bucket is not None or name == "Chi tiền theo thời gian" else 3
        await click_center(page, combos.nth(idx)); await page.wait_for_timeout(900)
        pop = page.locator("[data-state=open][role=dialog]").last
        items = [t.strip() for t in (await pop.inner_text()).split("\n") if t.strip()]
        print("   category options:", items)
        await pop.get_by_text(category_text, exact=True).click(); await page.wait_for_timeout(400)
        dlg = page.locator("[data-state=open][role=dialog]").last
    await dlg.get_by_label("Từ ngày").fill("2026-09-01")
    await dlg.get_by_label("Đến ngày").fill("2026-09-30")
    await dlg.get_by_role("button", name="Đồng ý").click()
    await page.wait_for_timeout(1800)
    return labels, combo_texts

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

        # ---- #4 Chi tiền theo mục chi ----
        labels, combos = await run_report(page, "Chi tiền theo mục chi")
        check("#4 dialog: only Kỳ báo cáo / Từ ngày / Đến ngày (no store/employee lines)",
              "Kỳ báo cáo" in labels and "Từ ngày" in labels and "Nhân viên" not in labels and "Mục chi |" not in labels, labels[:200])
        check("#4 title switched", "CHI TIỀN THEO MỤC CHI" in await page.inner_text("body"))
        hs = await headers(page)
        check("AC-12 #4 columns: Mục chi + Số tiền chi visible; ID Mục chi / Loại Mục chi hidden",
              "Mục chi" in hs and "Số tiền chi" in hs and "ID Mục chi" not in hs and "Loại Mục chi" not in hs, str(hs))
        r = await rows(page)
        idx = {h: i for i, h in enumerate(hs)}
        pairs = [(x[idx["Mục chi"]], x[idx["Số tiền chi"]]) for x in r] if "Mục chi" in idx and "Số tiền chi" in idx else r
        check("AC-12 #4 three rows descending: Tiền điện 150.000 / Chi khác 40.000 / Tiền nước 10.000",
              pairs == [("Tiền điện", "150.000"), ("Chi khác", "40.000"), ("Tiền nước", "10.000")], str(pairs))
        foot = await footer(page)
        check("AC-12 #4 footer total 200.000", "200.000" in foot, str(foot))
        await page.screenshot(path=f"{OUT}/t0304-01-theo-muc-chi.png", full_page=True)
        # Sửa mẫu: 4 columns, two unchecked
        await page.get_by_role("button", name="Thiết lập cột hiển thị").click(); await page.wait_for_timeout(700)
        cfg = page.locator("[role=dialog]").last
        names = await cfg.locator("tbody tr").evaluate_all("trs => trs.map(tr => tr.querySelector('td').textContent.trim())")
        states = await cfg.locator("tbody tr").evaluate_all("trs => trs.map(tr => Array.from(tr.querySelectorAll('button[role=checkbox], input[type=checkbox]')).map(c => c.getAttribute('aria-checked') ?? String(c.checked)))")
        vis = {n: s[0] for n, s in zip(names, states)}
        check("AC-12 #4 Sửa mẫu lists 4 columns, ID Mục chi + Loại Mục chi unchecked",
              names == ["ID Mục chi", "Mục chi", "Loại Mục chi", "Số tiền chi"] and vis.get("ID Mục chi") == "false" and vis.get("Loại Mục chi") == "false" and vis.get("Mục chi") == "true" and vis.get("Số tiền chi") == "true", f"{names} {vis}")
        await page.screenshot(path=f"{OUT}/t0304-02-sua-mau-4.png")
        await page.keyboard.press("Escape"); await page.wait_for_timeout(400)

        # ---- #5 Bảng kê tiền chi theo mục chi ----
        labels, combos = await run_report(page, "Bảng kê tiền chi theo mục chi")
        check("#5 dialog: Nhân viên / Phương thức thanh toán / Mục chi / Kỳ báo cáo / Từ ngày / Đến ngày",
              all(k in labels for k in ["Nhân viên", "Phương thức thanh toán", "Mục chi", "Kỳ báo cáo", "Từ ngày", "Đến ngày"]), labels[:260])
        check("#5 title switched", "BẢNG KÊ TIỀN CHI THEO MỤC CHI" in await page.inner_text("body"))
        hs = await headers(page)
        check("#5 columns: 11 visible in BE order; Mã đối tượng / Số hóa đơn / Mục chi hidden",
              hs[:2] == ["Ngày chứng từ", "Số chứng từ"] and "Mã đối tượng" not in hs and "Số hóa đơn" not in hs and "Mục chi" not in hs and "Người nhận" in hs and "Số tiền chi" in hs, str(hs))
        r = await rows(page); st = await row_styles(page)
        idx = {h: i for i, h in enumerate(hs)}
        first = r[0] if r else []
        check("AC-14 #5 first row is TỔNG CHI = 200.000", any("TỔNG CHI" in c for c in first) and "200.000" in first, str(first))
        check("AC-14 #5 first row bold", bool(st) and st[0][0], str(st[:1]))
        # group rows: name in first cells + amount; details: document numbers
        texts = [" | ".join(x) for x in r]
        print("   rows:", texts)
        groups = [i for i, x in enumerate(r) if not any(c.startswith("PC") for c in x) and any(c in ("Chi khác", "Tiền điện", "Tiền nước") for c in x)]
        details = [i for i, x in enumerate(r) if any(c.startswith("PC") for c in x)]
        check("AC-14 #5 group rows Chi khác / Tiền điện / Tiền nước present and bold", len(groups) == 3 and all(st[i][0] for i in groups), f"groups={groups} styles={[st[i] for i in groups]}")
        check("AC-14 #5 four detail rows (PC-04, PC-03, PC-02 x2) not bold and indented",
              len(details) == 4 and all(not st[i][0] for i in details) and all(st[i][1] > (st[g][1] if groups else 0) for i in details for g in groups[:1]),
              f"details={details} styles={[st[i] for i in details]}")
        check("AC-14 #5 order: Chi khác group first, then Tiền điện, then Tiền nước",
              groups and [next(c for c in r[i] if c in ("Chi khác", "Tiền điện", "Tiền nước")) for i in groups] == ["Chi khác", "Tiền điện", "Tiền nước"], str(groups))
        foot = await footer(page)
        check("#5 footer total 200.000", "200.000" in foot, str(foot))
        pager = await page.inner_text("body")
        check("AC-14 #5 pagination counts flattened rows (8 = 1 total + 3 groups + 4 details)", "8" in pager and len(r) == 8, f"{len(r)} rows")
        await page.screenshot(path=f"{OUT}/t0304-03-bang-ke-theo-muc.png", full_page=True)

        # ---- #6 Chi tiền theo thời gian ----
        labels, combos = await run_report(page, "Chi tiền theo thời gian")
        check("#6 dialog: Thống kê theo / Mục chi / Kỳ báo cáo / Từ ngày / Đến ngày",
              all(k in labels for k in ["Thống kê theo", "Mục chi", "Kỳ báo cáo", "Từ ngày", "Đến ngày"]) and "Nhân viên" not in labels, labels[:260])
        check("#6 Thống kê theo defaults to Ngày", len(combos) > 1 and combos[1] == "Ngày", str(combos))
        check("#6 title switched", "CHI TIỀN THEO THỜI GIAN" in await page.inner_text("body"))
        hs = await headers(page)
        check("#6 columns: Ngày + Số tiền chi", hs[:2] == ["Ngày", "Số tiền chi"], str(hs))
        r = await rows(page)
        idx = {h: i for i, h in enumerate(hs)}
        pairs = [(x[idx["Ngày"]], x[idx["Số tiền chi"]]) for x in r] if "Ngày" in idx else r
        check("AC-16 #6 Ngày: 08/09/2026 100.000; 09/09/2026 60.000; 10/09/2026 40.000",
              pairs == [("08/09/2026", "100.000"), ("09/09/2026", "60.000"), ("10/09/2026", "40.000")], str(pairs))
        foot = await footer(page)
        check("AC-16 #6 footer total 200.000", "200.000" in foot, str(foot))
        await page.screenshot(path=f"{OUT}/t0304-04-theo-thoi-gian-ngay.png", full_page=True)

        labels, combos = await run_report(page, "Chi tiền theo thời gian", bucket="Tháng")
        r = await rows(page)
        pairs = [(x[idx["Ngày"]], x[idx["Số tiền chi"]]) for x in r] if "Ngày" in idx else r
        check("AC-16 #6 Thống kê theo = Tháng → one row 09/2026 = 200.000", pairs == [("09/2026", "200.000")], str(pairs))
        await page.screenshot(path=f"{OUT}/t0304-05-theo-thoi-gian-thang.png")

        # AC-17 — Mục chi = Tiền điện (needs the new filter-options branch on the running API)
        try:
            labels, combos = await run_report(page, "Chi tiền theo thời gian", bucket="Ngày", category_text="Tiền điện")
            r = await rows(page)
            pairs = [(x[idx["Ngày"]], x[idx["Số tiền chi"]]) for x in r] if "Ngày" in idx else r
            check("AC-17 #6 Mục chi = Tiền điện → 08/09/2026 90.000; 09/09/2026 60.000", pairs == [("08/09/2026", "90.000"), ("09/09/2026", "60.000")], str(pairs))
            foot = await footer(page)
            check("AC-17 #6 footer 150.000", "150.000" in foot, str(foot))
            await page.screenshot(path=f"{OUT}/t0304-06-muc-chi-tien-dien.png")
        except Exception as e:
            check("AC-17 #6 Mục chi = Tiền điện", False, f"{type(e).__name__}: {str(e)[:160]}")
            await page.screenshot(path=f"{OUT}/t0304-06-muc-chi-error.png")

        bad = [(s, u) for s, u in net if s >= 400]
        print("   non-2xx cash-fund calls:", bad)
        print("   console errors:", errs[:5])
        await b.close()
    print("\nFAILURES:" if failures else "\nALL PASS", failures)
    sys.exit(1 if failures else 0)

asyncio.run(main())
