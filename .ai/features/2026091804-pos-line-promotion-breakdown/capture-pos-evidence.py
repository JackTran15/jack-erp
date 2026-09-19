"""
Headless POS evidence for `2026091804-pos-line-promotion-breakdown` — every
number is read from the DOM and asserted; a screenshot of the wrong number
still exits 1. Forked from the 2026091803 script (login, HCM branch, SKU
search) and extended per phase:

  --lines    UOW-01: cart rows + right panel (AC-01/02/04/06/07/08/09/10)
  --receipt  UOW-02: "In tạm tính" HTML per line (AC-11/13)
  --checkout UOW-02: "Thu tiền" with printing ON, read the printed invoice (AC-12)
  --posted <invoice code>  UOW-03: InvoiceReceiptDialog + reprint (AC-15/16)

Fixture (on the DB the API on :4000 is bound to — check, see memory
`api-db-binding-check`): SKU-685 685.000, SKU-100 100.000, KM000003 CTKM-A
item 10% on SKU-685, KM000004 CTKM-B invoice 10% NON_PROMO_ONLY. Engine facts
the expectations rest on (verified with POST /v2/promotions/evaluate):
  - CTKM-A is 10% of the gross unit price even with a manual discount → 68.500
  - a line with a manual discount is excluded from NON_PROMO_ONLY

Run:
    ~/.venvs/aidlc-verify/bin/python \\
      .ai/features/2026091804-pos-line-promotion-breakdown/capture-pos-evidence.py --lines
POS_URL overrides http://localhost:3001. pos-web must run with
VITE_CHECKOUT_V2=true (apps/pos-web/.env) for --checkout.
"""
import os
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

FEATURE = Path(__file__).resolve().parent
ROOT = FEATURE.parents[2]
CRED = ROOT / ".ai" / "credentials.env"
EVIDENCE = FEATURE / "evidence"
URL = os.environ.get("POS_URL", "http://localhost:3001") + "/pos"
HCM = "c3bf1922-3a2e-42d9-b00d-a7129efe592c"
SEARCH = 'input[placeholder="(F3) Nhập tên hàng hóa, mã vạch, mã SKU"]'
GRID = '[role="grid"][aria-label="Danh sách chương trình khuyến mãi"]'
LABEL_A = "CTKM-A hang hoa 10% SKU-685 - claude (68.500)"
LABEL_B = "CTKM-B hoa don 10% NON_PROMO_ONLY - claude (10.000)"

failures: list[str] = []


def check(name: str, cond: bool, detail=""):
    print(f"  {'ok ' if cond else 'FAIL'} {name} {detail}")
    if not cond:
        failures.append(name)


def creds():
    values = {}
    for line in CRED.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        values[k.strip()] = v.strip().strip('"')
    return values


def login(ctx):
    c = creds()
    page = ctx.new_page()
    page.goto(f"{URL}/dang-nhap", wait_until="domcontentloaded", timeout=30000)
    page.fill("#pos-login-org-id", c["LOCAL_BACKOFFICE_ORG_ID"])
    page.fill("#pos-login-email", c["LOCAL_BACKOFFICE_EMAIL"])
    page.fill("#pos-login-password", c["LOCAL_BACKOFFICE_PASSWORD"])
    page.click('button[type="submit"]')
    page.wait_for_selector('input[name="pos-branch"]', timeout=30000)
    page.click(f'input[name="pos-branch"][value="{HCM}"]')
    page.click('button[type="submit"]')
    page.wait_for_selector('[aria-label="Sapo POS"]', timeout=30000)
    page.wait_for_selector(SEARCH, timeout=30000)
    print("logged in:", page.url)
    return page


def settle(page):
    page.wait_for_timeout(1200)
    page.wait_for_function("() => !document.querySelector('.animate-pulse')", timeout=15000)


def add_sku(page, sku: str):
    page.fill(SEARCH, sku)
    page.press(SEARCH, "Enter")
    page.wait_for_selector(f'tr:has-text("{sku}")', timeout=15000)
    settle(page)


def row_info(page, sku: str):
    row = page.locator(f'tr:has-text("{sku}")').first
    labels = row.locator("span.italic").all_inner_texts()
    cell = row.locator("td").nth(7)
    struck = cell.locator("span.line-through").all_inner_texts()
    net = cell.inner_text().split("\n")[-1].strip()
    return {"labels": labels, "struck": struck[0] if struck else None, "net": net}


def summary_row(page, label: str):
    """Value of a PosSummaryRow by its label, or None when the row is absent."""
    row = page.locator(f'div:has(> *:has-text("{label}"))').filter(has_text=label).last
    if row.count() == 0:
        return None
    text = " ".join(row.inner_text().split())
    m = re.search(r"(-?[\d.]+)\s*$", text)
    return m.group(1) if m else text


def panel(page):
    return {
        "tong": summary_row(page, "Tổng tiền"),
        "km": summary_row(page, "Khuyến mại"),
        "due": summary_row(page, "Còn phải thu"),
    }


def manual_discount(page, sku: str, amount: int, reason: str):
    page.locator(f'tr:has-text("{sku}")').first.click(button="right")
    page.click('[role="menuitem"]:has-text("Khuyến mại")')
    page.wait_for_selector("text=Khuyến mại khác")
    page.click('button:has-text("VNĐ")')
    box = page.locator('input[aria-label="Giá trị khuyến mại"]')
    box.fill(str(amount))
    box.press("Tab")
    page.fill('input[aria-label="Lý do khuyến mại"]', reason)
    page.click('button:has-text("Đồng ý")')
    page.wait_for_selector("text=Khuyến mại khác", state="detached")
    settle(page)


def lines(page):
    print("== --lines")
    add_sku(page, "SKU-685")
    r, p = row_info(page, "SKU-685"), panel(page)
    print("  row", r, "panel", p)
    check("AC-01 label+strike", r["labels"] == [LABEL_A] and r["struck"] == "685.000" and r["net"] == "616.500")
    check("AC-07 no Khuyến mại row", p["tong"] == "616.500" and p["km"] is None and p["due"] == "616.500", str(p))
    page.screenshot(path=str(EVIDENCE / "L-01-sku685-ac01-ac07.png"))

    add_sku(page, "SKU-100")
    r, p = row_info(page, "SKU-100"), panel(page)
    print("  row", r, "panel", p)
    check("AC-02 invoice label, no strike", r["labels"] == [LABEL_B] and r["struck"] is None and r["net"] == "100.000")
    check("AC-08 panel", p["tong"] == "716.500" and p["km"] == "-10.000" and p["due"] == "706.500", str(p))
    km_label = page.locator('text=/Khuyến mại \\(10%\\)/').count()
    check("AC-08 label (10%)", km_label == 1)
    page.screenshot(path=str(EVIDENCE / "L-02-sku685-sku100-ac02-ac08.png"))

    manual_discount(page, "SKU-685", 50000, "test")
    r, p = row_info(page, "SKU-685"), panel(page)
    print("  row", r, "panel", p)
    check("AC-04 stacked labels", r["labels"] == ["KM 50.000 - test", LABEL_A] and r["struck"] == "685.000" and r["net"] == "566.500")
    check("AC-09 Σ Thành tiền = Tổng tiền", p["tong"] == "666.500" and p["due"] == "656.500", str(p))
    page.screenshot(path=str(EVIDENCE / "L-03-giam-tay-ac04-ac09.png"))

    # AC-10: ✕ on the Khuyến mại row → only CTKM-B is named and excluded
    page.click('button[aria-label="Bỏ áp dụng khuyến mại"]')
    page.wait_for_selector("text=Bỏ áp dụng khuyến mại")
    dialog = page.locator('[role="dialog"]').last.inner_text()
    print("  confirm:", " ".join(dialog.split())[:220])
    check("AC-10 confirm names only CTKM-B", "CTKM-B" in dialog and "CTKM-A" not in dialog)
    page.screenshot(path=str(EVIDENCE / "L-04-x-khuyen-mai-confirm-ac10.png"))
    page.click('button:has-text("Bỏ áp dụng")')
    page.wait_for_selector("text=Bỏ áp dụng khuyến mại", state="detached")
    settle(page)
    r, p = row_info(page, "SKU-685"), panel(page)
    print("  row", r, "panel", p)
    check("AC-10 after: row keeps CTKM-A, no Khuyến mại row", LABEL_A in r["labels"] and p["km"] is None and p["due"] == "666.500", str(p))
    page.screenshot(path=str(EVIDENCE / "L-05-sau-x-ac10.png"))

    # AC-06: exclude CTKM-A from the modal → label and strike go away
    page.click('button[aria-label="Voucher / quà tặng"]')
    page.wait_for_selector(GRID)
    page.locator(f'{GRID} [role="row"]:has-text("CTKM-A")').click()
    page.wait_for_selector("text=Bỏ áp dụng khuyến mại")
    page.click('button:has-text("Bỏ áp dụng")')
    page.wait_for_selector("text=Bỏ áp dụng khuyến mại", state="detached")
    page.keyboard.press("Escape")
    page.wait_for_selector(GRID, state="detached")
    settle(page)
    r, p = row_info(page, "SKU-685"), panel(page)
    print("  row", r, "panel", p)
    check("AC-06 CTKM-A gone, manual stays", r["labels"] == ["KM 50.000 - test"] and r["net"] == "635.000" and p["tong"] == "735.000")
    page.screenshot(path=str(EVIDENCE / "L-06-bo-ctkm-a-ac06.png"))


def receipt_from_iframe(page, ctx, png: str):
    """Lift the printed HTML out of the printer's hidden iframe (window.print is
    stubbed so `onafterprint` never removes it), open it standalone and return
    (page, rows) where rows = one dict per <tr> in the item table."""
    page.wait_for_selector('iframe[aria-hidden="true"]', state="attached", timeout=15000)
    page.wait_for_timeout(1500)
    frame = next((f for f in page.frames if f != page.main_frame and "col-name" in f.content()), None)
    if frame is None:
        raise RuntimeError("receipt iframe not found")
    html = frame.content()
    tmp = EVIDENCE / (png + ".html")
    tmp.write_text(html, encoding="utf-8")
    rp = ctx.new_page()
    rp.set_viewport_size({"width": 480, "height": 900})
    rp.goto(tmp.as_uri(), wait_until="load")
    rp.wait_for_timeout(400)
    rp.screenshot(path=str(EVIDENCE / png), full_page=True)
    rows = []
    for tr in rp.locator("table tr:has(td.col-name)").all():
        name_cell = tr.locator("td.col-name")
        rows.append({
            "name": name_cell.evaluate("el => el.firstChild && el.firstChild.textContent.trim()"),
            "subs": name_cell.locator("div.line-sub").all_inner_texts(),
            "price": tr.locator("td.col-price").inner_text().strip(),
            "total": tr.locator("td.col-total").inner_text().strip(),
        })
    totals = {}
    for label in ("Tiền hàng", "Giảm giá", "Khuyến mãi", "KM theo mặt hàng", "KM theo hóa đơn", "Tổng thanh toán"):
        loc = rp.locator(f'div.row:has-text("{label}")').first
        totals[label] = " ".join(loc.inner_text().split()) if loc.count() else None
    rp.close()
    tmp.unlink()
    # With print() stubbed, `onafterprint` never fires, so the printer's promise
    # (and the "In tạm tính" button's busy state) would hang for its 60s
    # timeout. Fire the handler ourselves — it removes the iframe and resolves.
    page.evaluate(
        "() => document.querySelectorAll('iframe[aria-hidden=\"true\"]').forEach(f => {"
        " const w = f.contentWindow; if (w && typeof w.onafterprint === 'function') w.onafterprint(new Event('afterprint')); else f.remove(); })"
    )
    page.wait_for_timeout(300)
    return rows, totals


def receipt(page, ctx):
    print("== --receipt")
    add_sku(page, "SKU-685")
    add_sku(page, "SKU-100")
    page.click('button[aria-label="In tạm tính"]:has-text("Alt + P")')
    rows, totals = receipt_from_iframe(page, ctx, "R-01-tam-tinh-ac11.png")
    for r in rows:
        print("  ", r)
    for k, v in totals.items():
        print("  ", v)
    r685 = next(r for r in rows if "685" in r["name"])
    r100 = next(r for r in rows if "100" in r["name"])
    check("AC-11 SKU-685 line", r685["subs"] == [LABEL_A] and r685["price"] == "685.000" and r685["total"] == "616.500", str(r685))
    check("AC-11 SKU-100 line", r100["subs"] == [LABEL_B] and r100["price"] == "100.000" and r100["total"] == "100.000", str(r100))
    check("AC-11 totals unchanged", totals["Tiền hàng"].endswith("785.000") and totals["Khuyến mãi"].endswith("78.500")
          and totals["KM theo mặt hàng"].endswith("68.500") and totals["KM theo hóa đơn"].endswith("10.000")
          and totals["Tổng thanh toán"].endswith("706.500"), str(totals))

    manual_discount(page, "SKU-685", 50000, "test")
    page.click('button[aria-label="In tạm tính"]:has-text("Alt + P")')
    rows, totals = receipt_from_iframe(page, ctx, "R-02-giam-tay-ac13.png")
    r685 = next(r for r in rows if "685" in r["name"])
    print("  ", r685)
    for v in totals.values():
        print("  ", v)
    check("AC-13 stacked labels on print", r685["subs"] == ["KM 50.000 - test", LABEL_A] and r685["total"] == "566.500", str(r685))
    check("AC-13 totals", (totals["Giảm giá"] or "").endswith("50.000") and totals["KM theo mặt hàng"].endswith("68.500")
          and totals["Tổng thanh toán"].endswith("656.500"), str(totals))


def checkout(page, ctx):
    """Thu tiền with printing ON — the printed invoice must match the estimate (AC-12).
    Leaves a paid invoice behind; its code is printed for UOW-03."""
    print("== --checkout")
    add_sku(page, "SKU-685")
    add_sku(page, "SKU-100")
    toggle = page.locator('[aria-label="In hóa đơn"]').first
    if toggle.get_attribute("aria-checked") != "true":
        toggle.click()
    page.click('button[aria-label="Thu tiền"]')
    try:
        page.wait_for_selector('button:has-text("Có")', timeout=8000)
        page.click('button:has-text("Có")')
    except Exception:
        pass
    rows, totals = receipt_from_iframe(page, ctx, "R-03-sau-thu-tien-ac12.png")
    for r in rows:
        print("  ", r)
    for v in totals.values():
        print("  ", v)
    r685 = next(r for r in rows if "685" in r["name"])
    r100 = next(r for r in rows if "100" in r["name"])
    check("AC-12 printed invoice lines", r685["subs"] == [LABEL_A] and r685["total"] == "616.500"
          and r100["subs"] == [LABEL_B] and r100["total"] == "100.000")
    check("AC-12 printed totals", totals["Tổng thanh toán"].endswith("706.500"), str(totals))
    page.wait_for_function(
        "() => ![...document.querySelectorAll('tr')].some(tr => tr.innerText.includes('SKU-685'))", timeout=30000)
    print("  checkout committed, cart reset")


def checkout_no_promo(page, ctx):
    """Cart SKU-100 only, cashier removes CTKM-B via the panel ✕, Thu tiền →
    an invoice with NO promotion snapshot. Prints its code for --posted-plain."""
    print("== --checkout-noprom")
    add_sku(page, "SKU-100")
    page.click('button[aria-label="Bỏ áp dụng khuyến mại"]')
    page.wait_for_selector("text=Bỏ áp dụng khuyến mại")
    page.click('button:has-text("Bỏ áp dụng")')
    page.wait_for_selector("text=Bỏ áp dụng khuyến mại", state="detached")
    settle(page)
    p = panel(page)
    check("no-promo cart: no Khuyến mại row, due 100.000", p["km"] is None and p["due"] == "100.000", str(p))
    toggle = page.locator('[aria-label="In hóa đơn"]').first
    if toggle.get_attribute("aria-checked") == "true":
        toggle.click()
    page.click('button[aria-label="Thu tiền"]')
    try:
        page.wait_for_selector('button:has-text("Có")', timeout=8000)
        page.click('button:has-text("Có")')
    except Exception:
        pass
    page.wait_for_function(
        "() => ![...document.querySelectorAll('tr')].some(tr => tr.innerText.includes('SKU-100'))", timeout=30000)
    print("  committed — read the newest paid invoice code from the DB for --posted-plain")


def posted_plain(page, ctx, code: str):
    """An invoice without a snapshot renders exactly as before: no labels, no strike."""
    print(f"== --posted-plain {code}")
    page.goto(f"{URL}/invoices", wait_until="domcontentloaded")
    page.wait_for_selector(f'button:has-text("{code}")', timeout=30000)
    page.click(f'button:has-text("{code}")')
    dialog = page.locator('[role="dialog"]:has-text("Số: ' + code + '")').first
    dialog.wait_for(timeout=30000)
    page.wait_for_timeout(1500)
    tr = dialog.locator("tbody tr").first
    cells = tr.locator("td").all()
    labels = cells[0].locator("div.italic").all_inner_texts()
    struck = cells[4].locator("span.line-through").count()
    total = cells[4].inner_text().strip()
    print("  ", {"labels": labels, "struck": struck, "total": total})
    check("plain dialog line", labels == [] and struck == 0 and total == "100.000")
    page.screenshot(path=str(EVIDENCE / f"P-03-dialog-{code}-khong-ctkm.png"))
    dialog.locator('button:has-text("In hóa đơn")').first.click()
    prows, totals = receipt_from_iframe(page, ctx, f"P-04-in-lai-{code}-khong-ctkm.png")
    print("  ", prows[0], totals["Khuyến mãi"], totals["Tổng thanh toán"])
    check("plain reprint", prows[0]["subs"] == [] and prows[0]["total"] == "100.000" and totals["Khuyến mãi"] is None
          and totals["Tổng thanh toán"].endswith("100.000"))


def posted(page, ctx, code: str):
    """UOW-03: open a posted invoice from Hóa đơn, assert the dialog's lines and
    the reprint HTML — all from the saved snapshot, no evaluate call (AC-15/16)."""
    print(f"== --posted {code}")
    evaluate_calls = []
    page.on("request", lambda r: evaluate_calls.append(r.url) if "/v2/promotions/evaluate" in r.url else None)
    page.goto(f"{URL}/invoices", wait_until="domcontentloaded")
    page.wait_for_selector(f'button:has-text("{code}")', timeout=30000)
    evaluate_calls.clear()
    page.click(f'button:has-text("{code}")')
    dialog = page.locator('[role="dialog"]:has-text("Số: ' + code + '")').first
    dialog.wait_for(timeout=30000)
    page.wait_for_timeout(1500)
    rows = []
    for tr in dialog.locator("tbody tr").all():
        cells = tr.locator("td").all()
        if len(cells) < 5:
            continue
        name_cell = cells[0]
        rows.append({
            "name": name_cell.locator("span").first.inner_text().strip(),
            "labels": name_cell.locator("div.italic").all_inner_texts(),
            "struck": (cells[4].locator("span.line-through").all_inner_texts() or [None])[0],
            "total": cells[4].inner_text().split("\n")[-1].strip(),
        })
    for r in rows:
        print("  ", r)
    r685 = next(r for r in rows if "685" in r["name"])
    r100 = next(r for r in rows if "100" in r["name"])
    check("AC-15 SKU-685 dialog line", r685["labels"] == [LABEL_A] and r685["struck"] == "685.000" and r685["total"] == "616.500", str(r685))
    check("AC-15 SKU-100 dialog line", r100["labels"] == [LABEL_B] and r100["struck"] is None and r100["total"] == "100.000", str(r100))
    page.screenshot(path=str(EVIDENCE / f"P-01-dialog-{code}-ac15.png"))

    dialog.locator('button:has-text("In hóa đơn")').first.click()
    prows, totals = receipt_from_iframe(page, ctx, f"P-02-in-lai-{code}-ac16.png")
    for r in prows:
        print("  ", r)
    for v in totals.values():
        print("  ", v)
    p685 = next(r for r in prows if "685" in r["name"])
    p100 = next(r for r in prows if "100" in r["name"])
    check("AC-16 reprint lines", p685["subs"] == [LABEL_A] and p685["total"] == "616.500"
          and p100["subs"] == [LABEL_B] and p100["total"] == "100.000")
    check("AC-16 reprint totals", totals["KM theo mặt hàng"].endswith("68.500") and totals["KM theo hóa đơn"].endswith("10.000")
          and totals["Tổng thanh toán"].endswith("706.500"), str(totals))
    check("AC-16 no evaluate call while dialog open", len(evaluate_calls) == 0, str(evaluate_calls))


def main():
    EVIDENCE.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="vi-VN")
        ctx.add_init_script("window.print = () => {};")
        page = login(ctx)
        if "--lines" in sys.argv:
            lines(page)
        if "--receipt" in sys.argv:
            receipt(page, ctx)
        if "--checkout" in sys.argv:
            checkout(page, ctx)
        if "--checkout-noprom" in sys.argv:
            checkout_no_promo(page, ctx)
        if "--posted" in sys.argv:
            posted(page, ctx, sys.argv[sys.argv.index("--posted") + 1])
        if "--posted-plain" in sys.argv:
            posted_plain(page, ctx, sys.argv[sys.argv.index("--posted-plain") + 1])
        browser.close()
    print("RESULT:", "PASS" if not failures else f"FAIL {failures}")
    sys.exit(0 if not failures else 1)


if __name__ == "__main__":
    main()
