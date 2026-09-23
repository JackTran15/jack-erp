"""
UOW-01 evidence — the Chương trình khuyến mãi modal prints "Hình thức" and
"Mô tả" on every row, including one the cashier has just un-ticked (AC-02/03/04).

Cart: SKU-685 → CTKM-A (item 10%, applied) and CTKM-B (invoice 10%
NON_PROMO_ONLY) both in the list. CTKM-A must carry a description on the dev
DB (`erp_dev_3008`, the one :4000 is bound to — memory `api-db-binding-check`);
it was set once with
    UPDATE promotion_programs SET description = 'Áp cho giày SKU-685 - claude' WHERE code = 'KM000003';
CTKM-B keeps an empty description so its "Mô tả" cell must print "—" (AC-04).

Screenshots: M-01-modal-applied.png (AC-02), M-02-modal-excluded.png (AC-03),
M-03-modal-no-description.png (AC-04). Every cell is read from the DOM and
asserted; a wrong string exits 1.
"""
import sys

from playwright.sync_api import sync_playwright

from pos_evidence_lib import EVIDENCE, GRID, add_sku, check, close_modal, login, open_modal, result_exit

DESC_A = "Áp cho giày SKU-685 - claude"


def by_name(rows, needle):
    return next((r for r in rows if needle in r["name"]), None)


def main():
    EVIDENCE.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="vi-VN")
        page = login(ctx)
        add_sku(page, "SKU-685")

        # AC-02: applied row prints kind + description
        rows = open_modal(page)
        for r in rows:
            print("  ", r)
        a, b = by_name(rows, "CTKM-A"), by_name(rows, "CTKM-B")
        check("AC-02 CTKM-A applied: Hình thức", a is not None and a["kind"] == "Giảm giá mặt hàng", str(a))
        check("AC-02 CTKM-A applied: Mô tả", a is not None and a["description"] == DESC_A, str(a))
        check("AC-02 CTKM-A status Đã áp dụng", a is not None and a["status"] == "Đã áp dụng", str(a))
        page.screenshot(path=str(EVIDENCE / "M-01-modal-applied.png"))

        # AC-04: CTKM-B has no description → "—", kind still labelled
        check("AC-04 CTKM-B Hình thức", b is not None and b["kind"] == "Giảm giá hoá đơn", str(b))
        check("AC-04 CTKM-B Mô tả = —", b is not None and b["description"] == "—", str(b))
        page.screenshot(path=str(EVIDENCE / "M-03-modal-no-description.png"))

        # AC-03: un-tick both → rows go "Đã bỏ áp dụng" and KEEP kind + description
        for name in ("CTKM-A", "CTKM-B"):
            page.locator(f'{GRID} [role="row"]:has-text("{name}")').click()
            page.wait_for_selector("text=Bỏ áp dụng khuyến mại", timeout=10000)
            page.click('button:has-text("Bỏ áp dụng")')
            page.wait_for_selector("text=Bỏ áp dụng khuyến mại", state="detached", timeout=10000)
            page.wait_for_timeout(1500)
        rows = []
        for row in page.locator(f'{GRID} [role="row"]').all():
            cells = row.locator('[role="gridcell"]').all_inner_texts()
            if len(cells) >= 4:
                rows.append({"name": cells[0].strip(), "kind": cells[1].strip(), "description": cells[2].strip(), "status": cells[3].strip()})
        for r in rows:
            print("  ", r)
        a, b = by_name(rows, "CTKM-A"), by_name(rows, "CTKM-B")
        check("AC-03 CTKM-A excluded: status", a is not None and a["status"] == "Đã bỏ áp dụng", str(a))
        check("AC-03 CTKM-A excluded: Hình thức not —", a is not None and a["kind"] == "Giảm giá mặt hàng", str(a))
        check("AC-03 CTKM-A excluded: Mô tả kept", a is not None and a["description"] == DESC_A, str(a))
        check("AC-03 CTKM-B excluded: status", b is not None and b["status"] == "Đã bỏ áp dụng", str(b))
        check("AC-03 CTKM-B excluded: Hình thức not —", b is not None and b["kind"] == "Giảm giá hoá đơn", str(b))
        check("AC-04 CTKM-B excluded: Mô tả = —", b is not None and b["description"] == "—", str(b))
        page.screenshot(path=str(EVIDENCE / "M-02-modal-excluded.png"))
        close_modal(page)
        browser.close()
    sys.exit(result_exit())


if __name__ == "__main__":
    main()
