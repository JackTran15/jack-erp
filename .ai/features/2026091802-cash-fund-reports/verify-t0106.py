"""T-01-06 browser boxes for "Tình hình thu chi" on the erp_test fixture.

Run with the aidlc-verify venv against FE :3005 (VITE_API_BASE_URL=http://localhost:4055)
and API :4055 on DB erp_test, right after `pnpm --filter @erp/api test:e2e -- cash-fund-report`:

    ~/.venvs/aidlc-verify/bin/python .ai/features/2026091802-cash-fund-reports/verify-t0106.py

Screenshots land in evidence/t0106-*.png; the script prints PASS/FAIL per check and
exits non-zero on any failure.
"""
import asyncio, os, re, sys
from playwright.async_api import async_playwright

BASE = os.environ.get("FE_URL", "http://localhost:3005")
OUT = os.path.join(os.path.dirname(__file__), "evidence")
ORG = "a0000000-0000-4000-8000-000000000001"
EXPECTED_REPORTS = [
    "Tình hình thu chi", "Bảng kê thu chi", "Chi tiền theo mục chi",
    "Bảng kê tiền chi theo mục chi", "Chi tiền theo thời gian",
]
failures = []

def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not ok: failures.append(name)

async def table_rows(page):
    rows = await page.eval_on_selector_all(
        "table tbody tr",
        "trs => trs.map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim()))",
    )
    # The grid pads with one empty filler <tr>; it is not a report row.
    return [r for r in rows if r and r[0]]

PERIODS = {"Năm nay": ("2026-01-01", "2026-12-31"), "Năm trước": ("2025-01-01", "2025-12-31")}

async def pick_period(page, label):
    # The preset control is a Radix popover the headless click does not open; the
    # two date inputs (aria-label Từ ngày / Đến ngày) are the same filter.
    frm, to = PERIODS[label]
    await page.get_by_label("Từ ngày").fill(frm)
    await page.get_by_label("Đến ngày").fill(to)
    await page.wait_for_timeout(300)

async def open_dialog_items(page, trigger):
    """Click a popover trigger with the mouse and return the text lines of the popover that opened."""
    box = await trigger.bounding_box()
    await page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    await page.wait_for_timeout(700)
    pop = page.locator("[data-state=open][role=dialog]").last
    text = await pop.inner_text()
    return [t.strip() for t in text.split("\n") if t.strip()]

async def main():
    os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
        page = await ctx.new_page()
        # The app prints through a hidden iframe whose window calls print(); the
        # init script runs in every frame, so count calls on the top window.
        await page.add_init_script("""
          try { top.__printCalls = top.__printCalls || 0; } catch (e) {}
          window.print = () => { try { top.__printCalls = (top.__printCalls || 0) + 1; top.__printedHtml = document.documentElement.outerHTML; } catch (e) {} };
        """)

        await page.goto(f"{BASE}/login", wait_until="networkidle")
        await page.fill("#login-org-id", ORG)
        await page.fill("#login-email", "admin@test.com")
        await page.fill("#login-password", "password123")
        await page.click("button[type=submit]")
        await page.wait_for_url(lambda u: "/login" not in u, timeout=20000)
        await page.wait_for_timeout(1000)

        # AC-01 — nav entry
        await page.get_by_role("button", name="Báo cáo", exact=True).click()
        await page.wait_for_timeout(600)
        await page.screenshot(path=f"{OUT}/t0106-01-nav.png")
        flyout = page.locator("text=Quỹ tiền").nth(1)   # nth(0) is the treasury group in the sidebar
        await flyout.click()
        await page.wait_for_timeout(1500)
        check("AC-01 nav Báo cáo → Quỹ tiền opens /reports/cash-fund", page.url.startswith(f"{BASE}/reports/cash-fund"), page.url)
        check("page title is TÌNH HÌNH THU CHI", "TÌNH HÌNH THU CHI" in await page.inner_text("body"))

        # AC-01 — dropdown of 5 reports in MShopKeeper order
        await page.get_by_role("button", name="Chọn báo cáo").click()
        await page.wait_for_timeout(700)
        dialog = page.locator("[data-state=open][role=dialog]").last
        options = await open_dialog_items(page, dialog.locator("button[role=combobox]").first)
        check("AC-01 dropdown lists the 5 reports in order", options == EXPECTED_REPORTS, str(options))
        await page.screenshot(path=f"{OUT}/t0106-02-dropdown.png")
        await page.keyboard.press("Escape"); await page.wait_for_timeout(300)
        await page.keyboard.press("Escape"); await page.wait_for_timeout(300)

        # AC-03 — Năm nay (2026) on the fixture
        await pick_period(page, "Năm nay")
        await page.get_by_role("button", name="Lấy dữ liệu").click()
        await page.wait_for_selector("table tbody tr", timeout=15000)
        await page.wait_for_timeout(800)
        rows = await table_rows(page)
        labels = [r[0] for r in rows]
        check("AC-03 11 rows with the fixture's categories", labels == [
            "I. Tiền đầu kỳ", "II. Tiền thu trong kỳ", "Thu từ bán hàng", "Thu lãi", "Thu khác",
            "III. Tiền chi trong kỳ", "Chi mua hàng hóa", "Tiền điện", "Tiền nước", "Chi khác",
            "IV. Tiền cuối kỳ (IV = I + II - III)"], str(labels))
        by = {r[0]: r[1:4] for r in rows}
        check("AC-03/04 Năm nay figures (I 0/1.000.000; II 1.570.000/1.600.000; III 400.000/0; IV 1.170.000/2.600.000)",
              by.get("I. Tiền đầu kỳ") == ["0", "1.000.000", "1.000.000"]
              and by.get("II. Tiền thu trong kỳ") == ["1.570.000", "1.600.000", "3.170.000"]
              and by.get("III. Tiền chi trong kỳ") == ["400.000", "0", "400.000"]
              and by.get("IV. Tiền cuối kỳ (IV = I + II - III)") == ["1.170.000", "2.600.000", "3.770.000"],
              str(by))
        weights = await page.eval_on_selector_all("table tbody tr", "trs => trs.map(tr => tr.querySelector('td') ? Number(getComputedStyle(tr.querySelector('td')).fontWeight) : 0)")
        check("section rows render heavier than detail rows (I/II/III/IV vs children)",
              weights[0] > weights[2] and weights[1] > weights[2] and weights[5] > weights[6] and weights[10] > weights[9], str(weights))
        await page.screenshot(path=f"{OUT}/t0106-03-nam-nay.png", full_page=True)

        # AC-06 — Năm trước (2025): 8 rows, all zero
        await pick_period(page, "Năm trước")
        await page.get_by_role("button", name="Lấy dữ liệu").click()
        await page.wait_for_timeout(1500)
        rows = await table_rows(page)
        check("AC-06 2025 keeps the 8-row skeleton, all zero", len(rows) == 8 and all(c == "0" for r in rows for c in r[1:4]), str(rows))
        await page.screenshot(path=f"{OUT}/t0106-04-nam-truoc.png")

        # AC-19 — export downloads an .xlsx
        await pick_period(page, "Năm nay")
        await page.get_by_role("button", name="Lấy dữ liệu").click()
        await page.wait_for_timeout(1200)
        async with page.expect_download(timeout=20000) as dl:
            await page.get_by_role("button", name="Xuất khẩu").click()
        d = await dl.value
        path = await d.path()
        size = os.path.getsize(path) if path else 0
        check("AC-19 Xuất khẩu downloads an .xlsx", d.suggested_filename.endswith(".xlsx") and size > 2000, f"{d.suggested_filename} {size} bytes")

        # AC-20 — In goes through the print path (window.print stubbed)
        await page.get_by_role("button", name="In", exact=True).click()
        await page.wait_for_timeout(500)
        await page.screenshot(path=f"{OUT}/t0106-05a-print-menu.png")
        await page.get_by_text("Khổ A4 (dọc)", exact=True).click()   # "In ▾" offers A4 ngang / dọc
        await page.wait_for_timeout(3500)
        calls = await page.evaluate("window.__printCalls || 0")
        printed_html = await page.evaluate("window.__printedHtml || ''")
        check("AC-20 In builds the print document and calls print()", calls > 0 and "IV." in printed_html and "THU CHI" in printed_html.upper(), f"print() calls={calls}, html={len(printed_html)} chars")
        await page.screenshot(path=f"{OUT}/t0106-05-after-print.png")

        # AC-21 — Sửa mẫu: hide Tiền gửi, save, reload → 3 columns; reset → 4
        gear = page.get_by_role("button", name="Thiết lập cột hiển thị")
        await gear.click()
        await page.wait_for_timeout(600)
        cfg = page.locator("[role=dialog]").last
        check("AC-21 Sửa mẫu opens with the 4 columns", await cfg.locator("text=Tiền gửi").count() >= 1 and await cfg.locator("text=Khoản mục").count() >= 1)
        await page.screenshot(path=f"{OUT}/t0106-06-sua-mau.png")
        row = cfg.locator("tr:has-text('Tiền gửi')").first
        await row.locator("input[type=checkbox], button[role=checkbox]").first.click()
        await cfg.get_by_role("button", name="Lưu").click()
        await page.wait_for_timeout(1500)
        headers = await page.eval_on_selector_all("table thead th", "ths => ths.map(th => th.textContent.trim()).filter(Boolean)")
        check("AC-21 after save the grid has 3 columns (no Tiền gửi)", "Tiền gửi" not in headers and "Tiền mặt" in headers, str(headers))
        await page.reload(wait_until="networkidle"); await page.wait_for_timeout(1500)
        headers2 = await page.eval_on_selector_all("table thead th", "ths => ths.map(th => th.textContent.trim()).filter(Boolean)")
        check("AC-21 template survives a reload", "Tiền gửi" not in headers2 and "Tiền mặt" in headers2, str(headers2))
        await page.screenshot(path=f"{OUT}/t0106-07-template-applied.png")
        await gear.click(); await page.wait_for_timeout(600)
        cfg = page.locator("[role=dialog]").last
        await cfg.get_by_role("button", name="Lấy mẫu ngầm định").click(); await page.wait_for_timeout(300)
        save = cfg.get_by_role("button", name="Lưu")
        if await save.count(): await save.click()
        await page.wait_for_timeout(1500)
        headers3 = await page.eval_on_selector_all("table thead th", "ths => ths.map(th => th.textContent.trim()).filter(Boolean)")
        check("AC-21 Lấy mẫu ngầm định restores the 4 columns", "Tiền gửi" in headers3, str(headers3))
        await page.screenshot(path=f"{OUT}/t0106-08-template-reset.png")
        await b.close()
    print("\n" + ("ALL PASS" if not failures else f"{len(failures)} FAILED: {failures}"))
    sys.exit(1 if failures else 0)

asyncio.run(main())
