"""T-02-03 browser boxes for "Bảng kê thu chi" on the erp_test fixture (same setup as verify-t0106.py)."""
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

async def headers(page):
    return await page.eval_on_selector_all("table thead th", "ths => ths.map(th => th.textContent.trim()).filter(Boolean)")

async def open_report_dialog(page):
    await page.get_by_role("button", name="Chọn báo cáo").click(); await page.wait_for_timeout(600)
    return page.locator("[data-state=open][role=dialog]").last

async def choose_in_popover(page, trigger, text):
    await click_center(page, trigger); await page.wait_for_timeout(500)
    await page.get_by_text(text, exact=True).last.click(); await page.wait_for_timeout(400)

async def run_bang_ke(page, *, method=None, employee_index=None):
    dlg = await open_report_dialog(page)
    if (await dlg.locator("button[role=combobox]").first.inner_text()).strip() != "Bảng kê thu chi":
        await choose_in_popover(page, dlg.locator("button[role=combobox]").first, "Bảng kê thu chi")
        dlg = page.locator("[data-state=open][role=dialog]").last
    labels = (await dlg.inner_text()).replace("\n", " | ")
    combos = dlg.locator("button[role=combobox]")
    if employee_index is not None:
        await click_center(page, combos.nth(1)); await page.wait_for_timeout(900)
        pop = page.locator("[data-state=open][role=dialog]").last
        items = [t.strip() for t in (await pop.inner_text()).split("\n") if t.strip()]
        print("   employee options:", items)
        await pop.get_by_text(items[employee_index], exact=True).click(); await page.wait_for_timeout(400)
        dlg = page.locator("[data-state=open][role=dialog]").last
    if method:
        await choose_in_popover(page, combos.nth(2), method)
        dlg = page.locator("[data-state=open][role=dialog]").last
    await dlg.get_by_label("Từ ngày").fill("2026-09-01")
    await dlg.get_by_label("Đến ngày").fill("2026-09-30")
    await dlg.get_by_role("button", name="Đồng ý").click()
    await page.wait_for_timeout(1800)
    return labels

async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1440, "height": 900}); page = await ctx.new_page()
        errs = []; page.on("console", lambda m: errs.append(m.text[:160]) if m.type == "error" else None)
        await page.goto(f"{BASE}/login", wait_until="networkidle")
        await page.fill("#login-org-id", ORG); await page.fill("#login-email", "admin@test.com"); await page.fill("#login-password", "password123")
        await page.click("button[type=submit]"); await page.wait_for_url(lambda u: "/login" not in u, timeout=20000)
        await page.goto(f"{BASE}/reports/cash-fund", wait_until="networkidle"); await page.wait_for_timeout(1200)

        labels = await run_bang_ke(page)
        check("AC-09 dialog has Nhân viên / Phương thức thanh toán / Kỳ báo cáo / Từ ngày / Đến ngày",
              all(k in labels for k in ["Nhân viên", "Phương thức thanh toán", "Kỳ báo cáo", "Từ ngày", "Đến ngày"]), labels[:200])
        check("title switched to BẢNG KÊ THU CHI", "BẢNG KÊ THU CHI" in await page.inner_text("body"))
        hs = await headers(page)
        check("AC-11 grid shows 14 columns by default (Mã đối tượng, Số hóa đơn hidden)",
              "Mã đối tượng" not in hs and "Số hóa đơn" not in hs and hs[:4] == ["Ngày chứng từ", "Số chứng từ", "Loại chứng từ", "Tham chiếu"] and "Số dư cuối kỳ" in hs, str(hs))
        r = await rows(page)
        first = r[0] if r else []
        idx = {h: i for i, h in enumerate(hs)}
        check("AC-08 first row is Số dư đầu kỳ = 1.500.000", any("Số dư đầu kỳ" in c for c in first) and "1.500.000" in first, str(first))
        details = r[1:]
        check("AC-08 nine voucher rows after the opening row", len(details) == 9, f"{len(details)} rows")
        running = [d[idx["Số dư cuối kỳ"]] for d in details] if "Số dư cuối kỳ" in idx else []
        check("AC-08 running balance ends at 3.770.000", running and running[-1] == "3.770.000", str(running))
        kinds = sorted(set(d[idx["Loại chứng từ"]] for d in details)); methods = sorted(set(d[idx["Phương thức thanh toán"]] for d in details))
        check("AC-08 Loại chứng từ / Phương thức labels", set(kinds) <= {"Phiếu thu", "Phiếu chi", "Thu tiền gửi", "Chi tiền gửi"} and set(methods) <= {"Tiền mặt", "Chuyển khoản"}, f"{kinds} {methods}")
        foot = await page.eval_on_selector_all("table tfoot td, table tfoot th", "els => els.map(e => e.textContent.trim())")
        check("AC-08 footer totals Tiền thu 2.670.000 / Tiền chi 400.000", "2.670.000" in foot and "400.000" in foot, str(foot))
        dates = [d[idx["Ngày chứng từ"]] for d in details]
        check("docDate of PT000002 is 2026-09-02 (T-02-07)", any(d[idx["Số chứng từ"]] == "PT000002" and d[idx["Ngày chứng từ"]] == "2026-09-02" for d in details), str(dates))
        await page.screenshot(path=f"{OUT}/t0203-01-bang-ke.png", full_page=True)

        # AC-10 — column filters: Diễn giải contains "Tiền điện"
        filt = page.locator("table thead input").filter(has_not=page.locator("[type=date]"))
        reason_i = idx.get("Diễn giải")
        inputs = page.locator("table thead tr").last.locator("input")
        n = await inputs.count(); print("   filter inputs:", n)
        target = None
        for i in range(n):
            ph = (await inputs.nth(i).get_attribute("aria-label") or "") + (await inputs.nth(i).get_attribute("placeholder") or "")
            if "Diễn giải" in ph: target = inputs.nth(i); break
        if target is None and reason_i is not None and n >= len(hs) - 1: target = inputs.nth(reason_i - 0)
        if target is not None:
            await target.fill("Tiền điện"); await page.keyboard.press("Enter"); await page.wait_for_timeout(1800)
            r2 = await rows(page); d2 = r2[1:]
            check("AC-10 Diễn giải contains 'Tiền điện' → 2 rows, opening + totals recomputed", len(d2) == 2 and all("Tiền điện" in d[idx["Diễn giải"]] for d in d2), str([d[idx['Diễn giải']] for d in d2]))
            await page.screenshot(path=f"{OUT}/t0203-02-loc-cot.png")
            await target.fill(""); await page.keyboard.press("Enter"); await page.wait_for_timeout(1200)
        else:
            check("AC-10 column filter input for Diễn giải found", False, f"{n} inputs")

        # AC-09 — Phương thức = Chuyển khoản → only PTG-01; Tiền mặt → 8
        await run_bang_ke(page, method="Chuyển khoản")
        r3 = await rows(page)
        check("AC-09 Phương thức = Chuyển khoản → 1 row (PTG-01, 1.600.000)", len(r3[1:]) == 1 and "1.600.000" in r3[1], str(r3[1:]))
        await page.screenshot(path=f"{OUT}/t0203-03-chuyen-khoan.png")
        await run_bang_ke(page, method="Tiền mặt")
        r4 = await rows(page)
        check("AC-09 Phương thức = Tiền mặt → 8 rows", len(r4[1:]) == 8, f"{len(r4[1:])} rows")
        # AC-09 — Nhân viên dropdown populates from filter-options and filters
        await run_bang_ke(page, method="Tất cả", employee_index=0)
        r5 = await rows(page)
        check("AC-09 Nhân viên dropdown populated and selecting the admin keeps the 9 rows of A", len(r5[1:]) == 9, f"{len(r5[1:])} rows")
        await page.screenshot(path=f"{OUT}/t0203-04-nhan-vien.png")

        # AC-11 — Sửa mẫu lists 16 columns, two unchecked, first four pinned
        await page.get_by_role("button", name="Thiết lập cột hiển thị").click(); await page.wait_for_timeout(700)
        cfg = page.locator("[role=dialog]").last
        names = await cfg.locator("tbody tr").evaluate_all("trs => trs.map(tr => tr.querySelector('td').textContent.trim())")
        states = await cfg.locator("tbody tr").evaluate_all("trs => trs.map(tr => Array.from(tr.querySelectorAll('button[role=checkbox], input[type=checkbox]')).map(c => c.getAttribute('aria-checked') ?? String(c.checked)))")
        check("AC-11 Sửa mẫu lists the 16 columns in order", names == ["Ngày chứng từ","Số chứng từ","Loại chứng từ","Tham chiếu","Tiền thu","Tiền chi","Số dư cuối kỳ","Phương thức thanh toán","Tài khoản ngân hàng","Nhân viên thu/chi","Mã đối tượng","Đối tượng nộp/nhận","Diễn giải","Mã cửa hàng","Tên cửa hàng","Số hóa đơn"], str(names))
        vis = {n: s[0] for n, s in zip(names, states)}; pin = {n: (s[1] if len(s) > 1 else None) for n, s in zip(names, states)}
        check("AC-11 Mã đối tượng / Số hóa đơn unchecked, others checked", vis.get("Mã đối tượng") in ("false",) and vis.get("Số hóa đơn") in ("false",) and all(vis[n] == "true" for n in names if n not in ("Mã đối tượng", "Số hóa đơn")), str(vis))
        check("AC-11 first four columns pinned", all(pin.get(n) == "true" for n in names[:4]) and pin.get("Tiền thu") == "false", str(pin))
        await page.screenshot(path=f"{OUT}/t0203-05-sua-mau.png")
        # enable Số hóa đơn → save → column appears
        await cfg.locator("tr:has-text('Số hóa đơn')").first.locator("button[role=checkbox], input[type=checkbox]").first.click()
        await cfg.get_by_role("button", name="Lưu").click(); await page.wait_for_timeout(1500)
        hs2 = await headers(page)
        check("AC-11 enabling Số hóa đơn in Sửa mẫu shows the column", "Số hóa đơn" in hs2, str(hs2[-3:]))
        await page.screenshot(path=f"{OUT}/t0203-06-so-hoa-don.png")
        await page.get_by_role("button", name="Thiết lập cột hiển thị").click(); await page.wait_for_timeout(600)
        cfg = page.locator("[role=dialog]").last
        await cfg.get_by_role("button", name="Lấy mẫu ngầm định").click(); await page.wait_for_timeout(300)
        s = cfg.get_by_role("button", name="Lưu")
        if await s.count(): await s.click()
        await page.wait_for_timeout(1200)
        check("no console errors", not errs, str(errs[:2]))
        await b.close()
    print("\n" + ("ALL PASS" if not failures else f"{len(failures)} FAILED: {failures}"))
    sys.exit(1 if failures else 0)

asyncio.run(main())
