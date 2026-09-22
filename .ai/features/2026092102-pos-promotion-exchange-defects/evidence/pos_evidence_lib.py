"""
Shared bits of the headless POS evidence scripts for
`2026092102-pos-promotion-exchange-defects` — forked verbatim (no behaviour
change) from `2026091804-pos-line-promotion-breakdown/capture-pos-evidence.py`
so `capture-uow01.py`, `capture-uow02.py` and `capture-uow04.py` read the same
DOM the same way: login + HCM branch, SKU search, cart row, summary rows,
right panel, and the `check()` collector that turns a wrong number into exit 1.

Fixture (on the DB the API on :4000 is bound to — `erp_dev_3008`, see memory
`api-db-binding-check`): SKU-685 685.000, SKU-100 100.000, KM000003 CTKM-A
item 10% on SKU-685, KM000004 CTKM-B invoice 10% NON_PROMO_ONLY.

Run any capture script with:
    ~/.venvs/aidlc-verify/bin/python .ai/features/2026092102-pos-promotion-exchange-defects/evidence/capture-uowNN.py
POS_URL overrides http://localhost:3001.
"""
import os
import re
from pathlib import Path

EVIDENCE = Path(__file__).resolve().parent
FEATURE = EVIDENCE.parent
ROOT = FEATURE.parents[2]
CRED = ROOT / ".ai" / "credentials.env"
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


def open_modal(page):
    """Open the Chương trình khuyến mãi modal and return its rows as
    [{name, kind, description, status}] — one dict per `[role="row"]` in GRID."""
    page.click('button[aria-label="Voucher / quà tặng"]')
    page.wait_for_selector(GRID, timeout=15000)
    page.wait_for_timeout(600)
    rows = []
    for row in page.locator(f'{GRID} [role="row"]').all():
        cells = row.locator('[role="gridcell"]').all_inner_texts()
        if len(cells) < 4:
            continue
        rows.append({
            "name": cells[0].strip(),
            "kind": cells[1].strip(),
            "description": cells[2].strip(),
            "status": cells[3].strip(),
        })
    return rows


def close_modal(page):
    page.keyboard.press("Escape")
    page.wait_for_selector(GRID, state="detached", timeout=15000)
    settle(page)


def result_exit():
    print("RESULT:", "PASS" if not failures else f"FAIL {failures}")
    return 0 if not failures else 1
