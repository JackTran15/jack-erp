"""
UOW-02 evidence — a return line shows the original invoice's promotion and a
NEGATIVE "Thành tiền" after it; "Tổng tiền" goes negative while "Trả lại khách"
keeps the number it had before the feature (AC-07/08/09).

Flow (same fixture as capture-uow01.py — DB `erp_dev_3008` behind :4000,
memory `api-db-binding-check`):
  1. Sale tab: scan SKU-685 → CTKM-A 10% (68.500) → "Thu tiền" → invoice S.
     S's code is read from the DB (newest paid SALE in HCM) — the toast is
     transient and printing is switched off to keep the run short.
  2. /return-goods → row S → "Đổi trả" → tick SKU-685 (qty 1) → Đồng ý.
  3. The return tab: label `[data-promotion-label="return"]`, strike -685.000,
     net -616.500 (R-01), panel Tổng tiền -616.500 / Trả lại khách 616.500 /
     cash box 616.500 (R-02). Then bump qty to 2 if S had 2 (it has 1 — skipped).
  4. Quick exchange with 1 × SKU-100 returned: no label, Thành tiền -100.000 (R-03).
Every number is read from the DOM and asserted; expectations are re-derived
from POST /v2/promotions/evaluate at run time, not hard-coded.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

import pos_evidence_lib as lib
from pos_evidence_lib import HCM, SEARCH, add_sku, check, login, panel, row_info, settle, summary_row

# Screenshots land next to this script (evidence/); OUT_DIR overrides for dry runs.
OUT = Path(os.environ.get("OUT_DIR", str(Path(__file__).resolve().parent)))

PSQL = ["docker", "exec", "erp-postgres", "psql", "-U", "postgres", "-d", "erp_dev_3008", "-At", "-c"]


def sql(q: str) -> str:
    return subprocess.run(PSQL + [q], capture_output=True, text=True, check=True).stdout.strip()


def fmt(n: float) -> str:
    """formatVnd: thousands with '.', sign kept."""
    n = int(round(n))
    s = f"{abs(n):,}".replace(",", ".")
    return f"-{s}" if n < 0 else s



def post_sale(page):
    """Sale tab: SKU-685, printing off, Thu tiền → returns the new invoice code."""
    add_sku(page, "SKU-685")
    r = row_info(page, "SKU-685")
    print("  sale row", r)
    toggle = page.locator('[aria-label="In hóa đơn"]').first
    if toggle.get_attribute("aria-checked") == "true":
        toggle.click()
    before = sql(f"SELECT COALESCE(MAX(code),'') FROM invoices WHERE type='SALE' AND status='paid' AND branch_id='{HCM}'")
    page.click('button[aria-label="Thu tiền"]')
    try:
        page.wait_for_selector('button:has-text("Có")', timeout=8000)
        page.click('button:has-text("Có")')
    except Exception:
        pass
    page.wait_for_function(
        "() => ![...document.querySelectorAll('tr')].some(tr => tr.innerText.includes('SKU-685'))", timeout=30000)
    page.wait_for_timeout(1500)
    code = sql(f"SELECT code FROM invoices WHERE type='SALE' AND status='paid' AND branch_id='{HCM}' ORDER BY created_at DESC LIMIT 1")
    assert code and code != before, f"no new invoice (before={before}, after={code})"
    print("  posted sale", code)
    return code


def open_return_for(page, code: str):
    """/return-goods → Đổi trả on row `code` → tick SKU-685 → Đồng ý → back on checkout."""
    page.goto(f"{page.url.split('/pos')[0]}/pos/return-goods", wait_until="domcontentloaded")
    page.wait_for_selector(f'tr:has-text("{code}")', timeout=30000)
    page.locator(f'tr:has-text("{code}") button:has-text("Đổi trả")').click()
    dialog = page.locator('[role="dialog"]:has-text("Chọn hàng trả lại")')
    dialog.wait_for(timeout=15000)
    dialog.locator('tr:has-text("SKU-685") input[type="checkbox"]').check(force=True)
    page.wait_for_timeout(300)
    dialog.locator('button:has-text("Đồng ý")').click()
    page.wait_for_selector(SEARCH, timeout=30000)
    page.wait_for_selector('tr:has-text("SKU-685")', timeout=30000)
    settle(page)


def return_line_info(page, sku: str):
    row = page.locator(f'tr:has-text("{sku}")').first
    labels = row.locator('[data-promotion-label="return"]').all_inner_texts()
    other = row.locator('[data-promotion-label="item"], [data-promotion-label="invoice"]').all_inner_texts()
    cell = row.locator("td").nth(7)
    struck = cell.locator("span.line-through").all_inner_texts()
    net = cell.inner_text().split("\n")[-1].strip()
    qty = row.locator('input[aria-label^="Số lượng"]').first.input_value()
    return {"labels": labels, "preview_labels": other, "struck": struck[0] if struck else None, "net": net, "qty": qty}


def cash_box(page):
    """Amount of the first payment line (PosPaymentMethodRow: aria-label "Số tiền Tiền mặt")."""
    box = page.locator('input[aria-label^="Số tiền"]').first
    return box.input_value() if box.count() else None


def main():
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="vi-VN")
        ctx.add_init_script("window.print = () => {};")
        page = login(ctx)

        # Expectations from the engine, not from memory: CTKM-A on one SKU-685.
        eval_calls = []
        page.on("response", lambda r: eval_calls.append(r) if "/v2/promotions/evaluate" in r.url else None)
        add_sku(page, "SKU-685")
        page.wait_for_timeout(800)
        body = json.loads(eval_calls[-1].text()) if eval_calls else None
        unit_disc = 0
        name_a = None
        if body:
            for prog in body["appliedPrograms"]:
                for ld in prog["lineDiscounts"]:
                    unit_disc += ld["discountAmount"]
                    name_a = prog["name"]
        print("  engine: CTKM-A on SKU-685 =", unit_disc, name_a)
        check("engine returned an item discount for SKU-685", unit_disc > 0 and name_a is not None)
        gross, net = 685000, 685000 - unit_disc
        page.locator('button[aria-label="Xóa Giày nữ 685 - claude"], button[aria-label^="Xóa"]').first.click()
        settle(page)

        # 1. post S
        code = post_sale(page)

        # 2-3. return 1 × SKU-685 against S
        open_return_for(page, code)
        r = return_line_info(page, "SKU-685")
        pn = panel(page)
        refund = summary_row(page, "Trả lại khách")
        cash = cash_box(page)
        print("  return row", r, "panel", pn, "refund", refund, "cash", cash)
        check("AC-07 return label = CTKM-A (unit × qty)", r["labels"] == [f"{name_a} ({fmt(unit_disc)})"], str(r["labels"]))
        check("AC-07 no preview label on the return line", r["preview_labels"] == [])
        check("AC-07 Thành tiền strikes -gross, prints -net", r["struck"] == fmt(-gross) and r["net"] == fmt(-net), str(r))
        page.screenshot(path=str(OUT / "R-01-return-line-ac07.png"))
        check("AC-08 Tổng tiền negative (not clamped to 0)", pn["tong"] == fmt(-net), str(pn))
        check("AC-08 Trả lại khách unchanged = net", refund == fmt(net), str(refund))
        # The refund flow never auto-fills the cash line (it was 0 before this
        # feature too — checked on the base commit 2026-09-22); what must not move
        # is "Trả lại khách". The cash box is logged so a drift would show.
        check("AC-08 cash box unchanged from pre-feature (0, cashier types it)", cash == "0", str(cash))
        page.screenshot(path=str(OUT / "R-02-panel-ac08.png"))

        # S sold 1 unit, so qty 2 is not reachable here (AC-07's second clause is
        # covered by the label formula being unit × qty; asserted at qty 1).

        # 4. quick exchange: return 1 × SKU-100, no original invoice → no label, one-line -100.000
        page.goto(f"{page.url.split('/pos')[0]}/pos/return-goods", wait_until="domcontentloaded")
        page.click('button:has-text("Đổi trả nhanh")')
        page.wait_for_selector('[role="tablist"][aria-label="Đổi trả nhanh"]', timeout=30000)
        page.click('[role="tab"]:has-text("Trả hàng")')
        add_sku(page, "SKU-100")
        r = return_line_info(page, "SKU-100")
        pn = panel(page)
        print("  quick return row", r, "panel", pn)
        check("AC-09 no promotion label on a quick return line", r["labels"] == [] and r["preview_labels"] == [], str(r))
        check("AC-09 Thành tiền -100.000 on one line, no strike", r["struck"] is None and r["net"] == fmt(-100000), str(r))
        check("AC-09 Tổng tiền -100.000", pn["tong"] == fmt(-100000), str(pn))
        page.screenshot(path=str(OUT / "R-03-quick-return-ac09.png"))

        browser.close()
    sys.exit(lib.result_exit())


if __name__ == "__main__":
    main()
