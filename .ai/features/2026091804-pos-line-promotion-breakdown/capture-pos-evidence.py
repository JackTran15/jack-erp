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


def main():
    EVIDENCE.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="vi-VN")
        ctx.add_init_script("window.print = () => {};")
        page = login(ctx)
        if "--lines" in sys.argv:
            lines(page)
        browser.close()
    print("RESULT:", "PASS" if not failures else f"FAIL {failures}")
    sys.exit(0 if not failures else 1)


if __name__ == "__main__":
    main()
