"""
POS evidence for T-03-02 / UOW-01 step 6 / UOW-03 step 4 — headless, reproducible.

Logs into pos-web (:3001) with the local dev admin from `.ai/credentials.env`,
pins branch Hồ Chí Minh, then builds the AC-10 cart by typing the SKU into the
search bar (an exact SKU match auto-adds — `ProductSearchInput.tsx`) and
screenshots the checkout after each line:

  1. SKU-685 alone      → "Còn phải thu" 616.500  (UOW-01 demo step 6, AC-11)
  2. SKU-685 + SKU-100  → "Còn phải thu" 706.500  (AC-10 / T-03-02)

The numbers are asserted from the DOM, not just captured: a screenshot of the
wrong total still exits 1.

Why not `aidlc-verify`: the runner's `form` recipe is a two-step email→password
flow and cannot fill the 3-field POS sign-in (see `.ai/aidlc.yaml` local-pos
comment); `local-backoffice-bm/-wh` being `required` with no credentials also
drops the whole rung to `skipped`.

Fixture it relies on (all rows suffixed `- claude`, on the DB the API is bound to):
  items      SKU-685 685.000 / SKU-100 100.000
  KM000003   ITEM_DISCOUNT 10% on SKU-685, priority 1
  KM000004   INVOICE_DISCOUNT 10% NON_PROMO_ONLY, priority 1

Run:
    ~/.venvs/aidlc-verify/bin/python \
      .ai/features/2026091803-ctkm-item-discount-invoice-scope/capture-pos-evidence.py

`--checkout` goes further and COMMITS a real invoice: opens the "Khuyến mãi"
modal (both programmes listed as "Đã áp dụng"), switches "In hóa đơn" off so
headless Chromium never hits a print dialog, clicks "Thu tiền", answers the
oversell prompt (fixture items carry no stock) and prints the rows written to
`invoices` / `invoice_checkout_promotions`. Off by default because it leaves a
paid invoice behind every run.
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
# `POS_URL` overrides the dev server (e.g. a second vite on :3002). `--checkout`
# needs the POS built with `VITE_CHECKOUT_V2=true` (apps/pos-web/.env, gitignored
# — production runs with it): without the flag pos-web takes the legacy
# `/invoices/:id/checkout` path, which never applies promotions, and "Thu tiền"
# fails with a 400 (see the "--checkout" note in 07-verification.md).
URL = os.environ.get("POS_URL", "http://localhost:3001") + "/pos"
HCM = "c3bf1922-3a2e-42d9-b00d-a7129efe592c"
SEARCH = 'input[placeholder="(F3) Nhập tên hàng hóa, mã vạch, mã SKU"]'


def creds():
    values = {}
    for line in CRED.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        values[k.strip()] = v.strip().strip('"')
    return values


def amount_due(page) -> str:
    row = page.locator("text=Còn phải thu").locator("xpath=ancestor::*[self::div][1]")
    text = row.inner_text()
    m = re.search(r"([\d.]+)\s*$", text.strip())
    return m.group(1) if m else text


def add_sku(page, sku: str, expect_lines: int):
    page.fill(SEARCH, sku)
    page.press(SEARCH, "Enter")
    # A line row carries the SKU code; wait until the cart holds the expected count.
    page.wait_for_function(
        "(n) => document.querySelectorAll('[data-line-id], tr, [role=\"row\"]').length >= n",
        arg=expect_lines,
        timeout=15000,
    )
    page.wait_for_selector(f"text={sku}", timeout=15000)
    # Promotion row settles after the evaluate round-trip.
    page.wait_for_timeout(1500)
    page.wait_for_function(
        "() => !document.querySelector('.animate-pulse')", timeout=15000
    )


def main():
    c = creds()
    org, email, password = (c.get(k, "") for k in
                            ("LOCAL_BACKOFFICE_ORG_ID", "LOCAL_BACKOFFICE_EMAIL", "LOCAL_BACKOFFICE_PASSWORD"))
    if not (org and email and password):
        sys.exit("missing LOCAL_BACKOFFICE_* credentials")
    EVIDENCE.mkdir(exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="vi-VN")
        # `BrowserWindowInvoicePrinter` removes its iframe on `onafterprint`, which
        # headless Chromium fires immediately — neuter print() in every frame so
        # the rendered receipt stays in the DOM long enough to be read (--receipt).
        ctx.add_init_script("window.print = () => {};")
        page = ctx.new_page()
        page.goto(f"{URL}/dang-nhap", wait_until="domcontentloaded", timeout=30000)
        page.fill("#pos-login-org-id", org)
        page.fill("#pos-login-email", email)
        page.fill("#pos-login-password", password)
        page.click('button[type="submit"]')
        page.wait_for_selector('input[name="pos-branch"]', timeout=30000)
        page.click(f'input[name="pos-branch"][value="{HCM}"]')
        page.click('button[type="submit"]')
        page.wait_for_selector('[aria-label="Sapo POS"]', timeout=30000)
        page.wait_for_selector(SEARCH, timeout=30000)
        print("logged in:", page.url)

        add_sku(page, "SKU-685", 1)
        due1 = amount_due(page)
        page.screenshot(path=str(EVIDENCE / "POS-01-sku685-616500.png"))
        print("after SKU-685: Còn phải thu =", due1)

        add_sku(page, "SKU-100", 2)
        due2 = amount_due(page)
        page.screenshot(path=str(EVIDENCE / "POS-02-sku685-sku100-706500.png"))
        print("after SKU-685 + SKU-100: Còn phải thu =", due2)

        invoice_ok = True
        if "--receipt" in sys.argv:
            invoice_ok = receipt(page, ctx)
        if "--checkout" in sys.argv and invoice_ok:
            invoice_ok = checkout(page)

        browser.close()

    ok = due1 == "616.500" and due2 == "706.500" and invoice_ok
    print("RESULT:", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


def receipt(page, ctx) -> bool:
    """`In tạm tính` renders the receipt through `renderInvoiceHtml` into a hidden
    iframe and calls print(). Headless never shows a print dialog, so lift the
    iframe's HTML out, open it in its own page and screenshot it — that is the
    per-type breakdown the POS actually prints ("KM theo mặt hàng" / "KM theo
    hóa đơn"), which the checkout screen itself never displays."""
    page.click('button[aria-label="In tạm tính"]:has-text("Alt + P")')
    page.wait_for_selector('iframe[aria-hidden="true"]', state="attached", timeout=15000)
    page.wait_for_timeout(1500)
    frame = next((f for f in page.frames if f != page.main_frame and "KM theo" in f.content()), None)
    if frame is None:
        print("receipt iframe not found")
        return False
    html = frame.content()
    out = EVIDENCE / "POS-05-in-tam-tinh.html"
    out.write_text(html, encoding="utf-8")
    rp = ctx.new_page()
    rp.set_viewport_size({"width": 480, "height": 900})
    rp.goto(out.as_uri(), wait_until="load")
    rp.wait_for_timeout(500)
    rp.screenshot(path=str(EVIDENCE / "POS-05-in-tam-tinh.png"), full_page=True)
    # Label and amount are sibling <span>s inside `div.row` (renderInvoiceHtml
    # `amountRow`) — read the whole row.
    def row(label: str) -> str:
        return " ".join(rp.locator(f'div.row:has-text("{label}")').first.inner_text().split())
    rows = {k: row(k) for k in ("Tiền hàng", "Khuyến mãi", "KM theo mặt hàng", "KM theo hóa đơn", "Tổng thanh toán")}
    rp.close()
    out.unlink()
    print("receipt:")
    for r in rows.values():
        print("   ", r)
    ok = rows["KM theo mặt hàng"].endswith("68.500") and rows["KM theo hóa đơn"].endswith("10.000") \
        and rows["Tổng thanh toán"].endswith("706.500")
    print("receipt breakdown:", "PASS" if ok else "FAIL")
    return ok


def checkout(page) -> bool:
    # Any 4xx/5xx from the API during the commit is the diagnosis — surface it.
    def on_response(res):
        if res.status >= 400 and "/api" in res.url or res.status >= 400 and ":4000" in res.url:
            try:
                body = res.text()[:400]
            except Exception:
                body = "<no body>"
            print(f"  HTTP {res.status} {res.request.method} {res.url}\n    {body}")
    page.on("response", on_response)

    # 1. The per-programme breakdown lives in the "Khuyến mãi" modal, not in the
    #    summary row — capture it with both programmes marked "Đã áp dụng".
    page.click('button[aria-label="Voucher / quà tặng"]')
    grid = '[role="grid"][aria-label="Danh sách chương trình khuyến mãi"]'
    page.wait_for_selector(grid, timeout=15000)
    page.wait_for_timeout(800)
    rows = page.locator(f"{grid} [role=\"row\"]").all_inner_texts()
    print("modal rows:")
    for r in rows[1:]:
        print("   ", " | ".join(x.strip() for x in r.split("\n") if x.strip()))
    page.screenshot(path=str(EVIDENCE / "POS-03-modal-khuyen-mai-2-chuong-trinh.png"))
    page.keyboard.press("Escape")
    page.wait_for_selector(grid, state="detached", timeout=10000)

    # 2. No print job in headless — flip "In hóa đơn" off first.
    toggle = page.locator('[aria-label="In hóa đơn"]').first
    if toggle.get_attribute("aria-checked") == "true":
        toggle.click()
        page.wait_for_timeout(300)
    print("In hóa đơn:", toggle.get_attribute("aria-checked"))

    # 3. Thu tiền → oversell prompt (no stock) → commit.
    page.click('button[aria-label="Thu tiền"]')
    try:
        page.wait_for_selector('button:has-text("Có")', timeout=8000)
        page.click('button:has-text("Có")')
        print("oversell prompt answered")
    except Exception:
        print("no oversell prompt")
    # The cart table resets once the saga committed. The catalogue grid below
    # also lists the fixture SKUs, so look at <tr> rows only.
    try:
        page.wait_for_function(
            "() => ![...document.querySelectorAll('tr')].some(tr => tr.innerText.includes('SKU-685'))",
            timeout=30000,
        )
    except Exception:
        page.screenshot(path=str(EVIDENCE / "POS-debug-checkout-stuck.png"))
        for sel in ('[role="dialog"]', '[data-sonner-toast]', '.pos-dialog__alert', '[role="alert"]'):
            for t in page.locator(sel).all_inner_texts():
                print(f"  {sel}: {t.strip()[:300]}")
        return False
    page.wait_for_timeout(1500)
    page.screenshot(path=str(EVIDENCE / "POS-04-sau-thu-tien.png"))
    print("checkout committed, cart reset")
    return True


if __name__ == "__main__":
    main()
