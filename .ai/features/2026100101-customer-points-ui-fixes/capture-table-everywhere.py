"""
Evidence capture for UOW-05 (row contrast on every backoffice table) of 2026100101-customer-points-ui-fixes.

Read-only. Runs against the erp3 Vite on :3005. Each step measures computed colours of real rows:
  AC-23  ticked / focused rows on BaseDataTable pages turn --table-row-selected
  AC-25  one hand-written `.erp-data-table` per group: stripes + hover (+ selected when the table has one)
A step whose page has no data on the local DB records FAIL with reason "no data" rather than passing.

    ~/.venvs/aidlc-verify/bin/python .ai/features/2026100101-customer-points-ui-fixes/capture-table-everywhere.py [BASE_URL] [step ...]
"""
import importlib.util
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("cap", HERE / "capture-table-contrast.py")
cap = importlib.util.module_from_spec(spec)
argv, sys.argv = sys.argv, sys.argv[:1]
spec.loader.exec_module(cap)
sys.argv = argv

BASE = next((a for a in sys.argv[1:] if a.startswith("http")), "http://localhost:3005")
STEPS = [a for a in sys.argv[1:] if not a.startswith("http")] or [
    "items", "programs", "cash", "invoice", "invoice-lines", "provider-groups", "gift", "lookup-field"]
cap.BASE = BASE
OUT = HERE / "evidence" / "uow-05"
record = cap.record


def colors(page, row):
    return cap.row_colors(page, row)


def tokens(page):
    return {k: cap.token(page, f"--table-row-{k}") for k in ("even", "odd", "hover", "selected")}


def stripes_and_hover(page, name, rows):
    """Stripes need ≥2 rows; hover is checked on the last of the first three rows."""
    t = tokens(page)
    n = rows.count()
    if n < 1:
        record(f"{name}.stripes", False, reason="no data", rows=n)
        return False
    page.mouse.move(0, 0)
    if n >= 2:
        r0, r1 = colors(page, rows.nth(0)), colors(page, rows.nth(1))
        record(f"{name}.stripes", r0["row"] == t["even"] and r1["row"] == t["odd"], even=r0["row"], odd=r1["row"])
    else:
        record(f"{name}.stripes", False, reason="only 1 row — stripes not observable", rows=n)
    target = rows.nth(min(n, 3) - 1)
    target.scroll_into_view_if_needed()
    target.hover(force=True)
    page.wait_for_timeout(150)
    rh = colors(page, target)
    page.screenshot(path=str(OUT / f"{name}-hover.png"), full_page=True)
    record(f"{name}.hover", rh["row"] == t["hover"] and all(c == t["hover"] for c in rh["frozen"]), got=rh)
    return n >= 2


def tick_rows(page, name, rows, indexes):
    """AC-23: tick the leading checkbox of each row, then every ticked row (and its frozen cells) is purple."""
    t = tokens(page)
    if rows.count() <= max(indexes):
        record(f"{name}.ticked", False, reason="no data", rows=rows.count())
        return
    for i in indexes:
        rows.nth(i).locator("input[type='checkbox']").first.check()
    page.mouse.move(0, 0)
    page.wait_for_timeout(300)
    got = [colors(page, rows.nth(i)) for i in indexes]
    page.screenshot(path=str(OUT / f"{name}-ticked.png"), full_page=True)
    record(f"{name}.ticked", all(g["row"] == t["selected"] and all(c == t["selected"] for c in g["frozen"]) for g in got),
           got=got, expect=t["selected"])


def select_row(page, row):
    """Click a list row to show its detail panel, without opening a link/dialog from a cell."""
    row.locator("td").nth(1).click()
    page.wait_for_timeout(800)
    if page.locator("div.fixed.inset-0").count():
        page.keyboard.press("Escape")
        page.wait_for_timeout(400)


def data_rows(page, scope="table"):
    return page.locator(f"{scope} tbody tr").filter(has=page.locator("td:nth-child(2)"))


def open_year(page):
    """Widen the period filter (Năm nay → custom range) so list pages have rows."""
    dates = page.locator("input[type='date']")
    if dates.count() >= 2:
        dates.nth(0).fill("2025-01-01")
        dates.nth(1).fill("2026-12-31")
        btn = page.locator("button:has-text('Lấy dữ liệu')")
        if btn.count():
            btn.first.click()
        page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1500)  # rows render after the fetch settles


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        cap.login(page)

        if "items" in STEPS:  # CrudListPage (T-05-03)
            page.goto(f"{BASE}/admin/inventory-items", wait_until="networkidle")
            rows = data_rows(page)
            rows.first.wait_for(timeout=30000)
            tick_rows(page, "items", rows, [2, 3])

        if "programs" in STEPS:  # ProgramsTable (T-05-03)
            page.goto(f"{BASE}/promotions/programs", wait_until="networkidle")
            page.wait_for_timeout(1000)
            tick_rows(page, "programs", data_rows(page), [1])

        if "cash" in STEPS:  # TreasuryCashReceiptsPage (T-05-04) + ReceiptCashDetailPanel (T-05-09)
            page.goto(f"{BASE}/treasury/cash/receipts-expenses", wait_until="networkidle")
            open_year(page)
            rows = data_rows(page).first.locator("xpath=ancestor::table[1]").locator("tbody tr")
            if data_rows(page).count() >= 2:
                select_row(page, data_rows(page).nth(1))
                t = tokens(page)
                sel = colors(page, data_rows(page).nth(1))
                record("cash.selected", sel["row"] == t["selected"], got=sel)
                # Pick the first voucher whose detail has ≥2 lines, so stripes are observable.
                detail_rows = lambda: page.locator("table.erp-data-table").last.locator("tbody tr").filter(has=page.locator("td:nth-child(2)"))
                for i in range(min(data_rows(page).count(), 20)):
                    select_row(page, data_rows(page).nth(i))
                    if detail_rows().count() >= 2:
                        break
                stripes_and_hover(page, "cash-detail", detail_rows())
            else:
                record("cash.selected", False, reason="no data")

        if "stocktake" in STEPS:  # StockTakeDetailPanel (T-05-08)
            page.goto(f"{BASE}/inventory/stock-takes", wait_until="networkidle")
            open_year(page)
            if data_rows(page).count():
                select_row(page, data_rows(page).first)
                stripes_and_hover(page, "stocktake-detail",
                                  page.locator("table.erp-data-table").first.locator("tbody tr").filter(has=page.locator("td:nth-child(2)")))
            else:
                record("stocktake-detail.stripes", False, reason="no data")

        if "invoice" in STEPS:  # InvoiceDetailLines via a report drill-down is data-dependent; use goods receipt detail instead
            page.goto(f"{BASE}/purchases/imports", wait_until="networkidle")
            open_year(page)
            if data_rows(page).count():
                select_row(page, data_rows(page).first)
                stripes_and_hover(page, "receipt-detail",
                                  page.locator("table.erp-data-table").first.locator("tbody tr").filter(has=page.locator("td:nth-child(2)")))
            else:
                record("receipt-detail.stripes", False, reason="no data")

        if "invoice-lines" in STEPS:  # InvoiceDetailLines (T-05-06): report → Bảng kê hoá đơn → hoá đơn
            page.goto(f"{BASE}/reports/sales", wait_until="networkidle")
            open_year(page)
            done = False
            links = page.locator("table tbody [class*='text-info']")
            for i in range(min(links.count(), 8)):
                links.nth(i).click()
                page.wait_for_timeout(1200)
                inv = page.locator("[role='dialog'] a:has-text('INV-'), [role='dialog'] [class*='text-info']:has-text('INV-')")
                for j in range(min(inv.count(), 6)):
                    inv.nth(j).click()
                    page.wait_for_timeout(1200)
                    tbl = page.locator("[role='dialog'] table.erp-data-table")
                    rows = tbl.last.locator("tbody tr").filter(has=page.locator("td:nth-child(2)"))
                    if tbl.count() and rows.count() >= 2:
                        done = stripes_and_hover(page, "invoice-lines", rows)
                        break
                    page.keyboard.press("Escape")
                    page.wait_for_timeout(300)
                if done:
                    break
                page.keyboard.press("Escape")
                page.wait_for_timeout(300)
            if not done:
                record("invoice-lines.stripes", False, reason="no invoice with ≥2 lines reached")

        if "provider-groups" in STEPS:  # ProviderGroupListPage (T-05-07). Gift/BuyGet/Tiered grids: those program
            # types cannot be created from the UI ("Thêm mới" offers only the two discount types) and none exist locally.
            page.goto(f"{BASE}/admin/provider-groups", wait_until="networkidle")
            page.wait_for_timeout(1000)
            tbl = page.locator("table.erp-data-table").first
            rows = tbl.locator("tbody tr").filter(has=page.locator("td:nth-child(2)"))
            if stripes_and_hover(page, "provider-groups", rows):
                rows.nth(1).click()
                page.mouse.move(0, 0)
                page.wait_for_timeout(300)
                t = tokens(page)
                got = colors(page, rows.nth(1))
                page.screenshot(path=str(OUT / "provider-groups-selected.png"))
                record("provider-groups.selected", got["row"] == t["selected"], got=got)

        if "gift" in STEPS:  # GiftProductGrid (T-05-07) on a temporary STOPPED gift program (GIFT_PROGRAM_ID)
            import os
            gid = os.environ.get("GIFT_PROGRAM_ID")
            if gid:
                page.goto(f"{BASE}/promotions/programs/{gid}/edit", wait_until="networkidle")
                tbl = page.locator("table.erp-data-table").filter(has=page.locator("button[aria-label='Xóa dòng']")).first
                tbl.wait_for(timeout=30000)
                tbl.scroll_into_view_if_needed()
                stripes_and_hover(page, "gift-grid", tbl.locator("tbody tr"))
            else:
                record("gift-grid.stripes", False, reason="GIFT_PROGRAM_ID not set")

        if "lookup-field" in STEPS:  # LookupField dropdown (T-05-05) in CTKM-A's goods grid
            page.goto(f"{BASE}/promotions/programs/923525f9-2477-4e64-b67f-22e1ff0dd9a2/edit", wait_until="networkidle")
            box = page.locator("input[placeholder*='Tìm mã hoặc tên hàng']").last
            box.wait_for(timeout=30000)
            box.click()
            box.fill("ABA")
            page.wait_for_timeout(1500)
            tbl = page.locator("table.erp-data-table").filter(has=page.locator("tr[aria-selected]")).last
            rows = tbl.locator("tbody tr")
            if rows.count() >= 3:
                box.press("ArrowDown")
                box.press("ArrowDown")
                page.wait_for_timeout(200)
                t = tokens(page)
                hi = tbl.locator("tbody tr[data-selected='true']")
                page.mouse.move(0, 0)
                page.screenshot(path=str(OUT / "lookup-field-highlight.png"))
                record("lookup-field.highlighted", hi.count() == 1 and colors(page, hi.first)["row"] == t["selected"],
                       got=colors(page, hi.first) if hi.count() else None)
                plain = tbl.locator("tbody tr:not([data-selected='true'])")
                c = [colors(page, plain.nth(i))["row"] for i in range(min(plain.count(), 3))]
                record("lookup-field.stripes", t["even"] in c and t["odd"] in c, rows=c)
            else:
                record("lookup-field.stripes", False, reason="dropdown has <3 rows", rows=rows.count())
        browser.close()
    (OUT / "summary.json").write_text(json.dumps(cap.results, ensure_ascii=False, indent=2), encoding="utf-8")
    sys.exit(0 if all(r["ok"] for r in cap.results.values()) else 1)


if __name__ == "__main__":
    main()
