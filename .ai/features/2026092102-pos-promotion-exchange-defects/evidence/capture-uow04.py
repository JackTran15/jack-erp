"""
UOW-04 evidence — the exchange tab uses promotions for the bought lines, the
cashier can toggle them in the modal, and what the POS posts is the number the
BE dry-run returned (AC-21/22/23/24/25/27).

Same fixture as capture-uow01/02 (DB `erp_dev_3008` behind :4000 — memory
`api-db-binding-check`): SKU-685 685.000 with CTKM-A item 10% (68.500 →
616.500/unit), SKU-100 100.000, CTKM-B invoice 10% NON_PROMO_ONLY. Every
scenario posts a fresh sale S (1 × SKU-685, customer C CÚC so the locked
customer card on the return tab still shows the promotion-modal button),
returns it against S and buys extra. Expectations are re-derived from
POST /v2/promotions/evaluate at run time, not hard-coded.

  0. what POST /v2/promotions/evaluate receives: a 10% manual discount on the
     sale tab as manualLineDiscount 68.500 (AC-26); on the exchange tabs only
     the bought lines, and lines: [] for a return-only cart (AC-20) — X-00.
  1. return S + buy SKU-685 → modal CTKM-A Đã áp dụng (X-01, AC-21); line
     label + 685.000/616.500 (X-02, AC-22); Tổng tiền 0, no due/refund rows
     (X-03, AC-23); Thanh toán with "In hóa đơn" on → the printed invoice has the
     bought line labelled and the return block unlabelled (X-04, AC-27 — the
     exchange tab has no "In tạm tính" button); preview netAmount 0, body
     OFFSET (X-05, AC-24).
  2. as 1, CTKM-A (and CTKM-B, which would otherwise step in) un-ticked →
     Còn phải thu 68.500; body payments 68.500 + excludedProgramIds
     (X-06/X-07, AC-23/24).
  3. return S + buy SKU-100 (CTKM-B 10% applies to it) → Trả lại khách =
     BE refundedAmount = 616.500 − 90.000; body refund (X-08, AC-24).
  4. AC-25 (a): /v2/promotions/evaluate aborted → panel lacks the label, but
     Thanh toán still goes exchanges → preview → checkout-return OFFSET and the
     posted OUT line has promotion_discount 68.500 (X-09/X-10).
     AC-25 (b): checkout-return/preview aborted → error toast, no
     checkout-return request (X-11).
"""
import json
import os
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

import pos_evidence_lib as lib
from pos_evidence_lib import GRID, HCM, SEARCH, add_sku, check, login, panel, row_info, settle, summary_row

OUT = Path(os.environ.get("OUT_DIR", str(Path(__file__).resolve().parent)))
PSQL = ["docker", "exec", "erp-postgres", "psql", "-U", "postgres", "-d", "erp_dev_3008", "-At", "-c"]
CUSTOMER_PHONE = "0388335577"  # C CÚC on erp_dev_3008
SKU685_ID = "88455098-3680-435a-baf1-8c623229a36c"
SKU100_ID = "f5d093a3-d8ad-40a5-a411-5c407bf383fd"


def sql(q: str) -> str:
    return subprocess.run(PSQL + [q], capture_output=True, text=True, check=True).stdout.strip()


def fmt(n: float) -> str:
    n = int(round(n))
    s = f"{abs(n):,}".replace(",", ".")
    return f"-{s}" if n < 0 else s


def pick_customer(page):
    box = page.locator('input[placeholder="(F4) SDT, tên khách hàng"]')
    box.fill(CUSTOMER_PHONE)
    page.wait_for_selector('[role="listbox"] [role="option"]', timeout=15000)
    page.locator('[role="listbox"] [role="option"]').first.click()
    page.wait_for_selector('input[placeholder="(F4) SDT, tên khách hàng"]', state="detached", timeout=15000)
    settle(page)


def post_sale(page) -> str:
    """Sale tab: SKU-685 to customer C CÚC, printing off, Thu tiền → new invoice code."""
    add_sku(page, "SKU-685")
    pick_customer(page)
    toggle = page.locator('[aria-label="In hóa đơn"]').first
    if toggle.get_attribute("aria-checked") == "true":
        toggle.click()
    before = sql(f"SELECT COALESCE(MAX(code),'') FROM invoices WHERE type='SALE' AND status='paid' AND branch_id='{HCM}'")
    page.click('button[aria-label="Thu tiền"]')
    try:
        page.wait_for_selector('button:has-text("Có")', timeout=6000)
        page.click('button:has-text("Có")')
    except Exception:
        pass
    page.wait_for_function(
        "() => ![...document.querySelectorAll('tr')].some(tr => tr.innerText.includes('SKU-685'))", timeout=30000)
    page.wait_for_timeout(1500)
    code = sql(f"SELECT code FROM invoices WHERE type='SALE' AND status='paid' AND branch_id='{HCM}' ORDER BY created_at DESC LIMIT 1")
    assert code and code != before, f"no new sale (before={before}, after={code})"
    print("  posted sale", code)
    return code


def open_return_for(page, code: str):
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


def bought_row(page, sku: str):
    """The non-return row for `sku` (return rows carry a negative qty)."""
    rows = page.locator(f'tr:has-text("{sku}")').all()
    for row in rows:
        qty = row.locator('input[aria-label^="Số lượng"]').first.input_value()
        if not qty.startswith("-"):
            cell = row.locator("td").nth(7)
            struck = cell.locator("span.line-through").all_inner_texts()
            return {
                "labels": row.locator('[data-promotion-label="item"], [data-promotion-label="invoice"]').all_inner_texts(),
                "return_labels": row.locator('[data-promotion-label="return"]').all_inner_texts(),
                "struck": struck[0] if struck else None,
                "net": cell.inner_text().split("\n")[-1].strip(),
            }
    return None


def return_row(page, sku: str):
    for row in page.locator(f'tr:has-text("{sku}")').all():
        if row.locator('input[aria-label^="Số lượng"]').first.input_value().startswith("-"):
            return {"preview_labels": row.locator('[data-promotion-label="item"], [data-promotion-label="invoice"]').all_inner_texts(),
                    "return_labels": row.locator('[data-promotion-label="return"]').all_inner_texts()}
    return None


def modal_rows(page):
    rows = []
    for row in page.locator(f'{GRID} [role="row"]').all():
        cells = row.locator('[role="gridcell"]').all_inner_texts()
        if len(cells) >= 4:
            rows.append({"name": cells[0].strip(), "kind": cells[1].strip(), "status": cells[3].strip()})
    return rows


def exclude_in_modal(page, name: str):
    page.click('button[aria-label="Voucher / quà tặng"]')
    page.wait_for_selector(GRID, timeout=15000)
    page.locator(f'{GRID} [role="row"]:has-text("{name}")').click()
    page.wait_for_selector("text=Bỏ áp dụng khuyến mại", timeout=10000)
    page.click('button:has-text("Bỏ áp dụng")')
    page.wait_for_selector("text=Bỏ áp dụng khuyến mại", state="detached", timeout=10000)
    page.wait_for_timeout(1200)
    rows = modal_rows(page)
    lib.close_modal(page)
    return rows


class Wire:
    """Captures the exchange → preview → checkout-return exchange of one Thanh toán."""

    def __init__(self, page):
        self.requests = []
        self.responses = {}
        page.on("request", self._req)
        page.on("response", self._res)

    def _req(self, r):
        if r.method == "POST" and ("/invoices/exchanges" in r.url or "/checkout-return" in r.url):
            self.requests.append((r.url.split("/invoices")[-1], json.loads(r.post_data or "{}")))

    def _res(self, r):
        if "/checkout-return" in r.url:
            try:
                self.responses[r.url.split("/invoices")[-1]] = (r.status, r.json())
            except Exception:
                self.responses[r.url.split("/invoices")[-1]] = (r.status, None)

    def reset(self):
        self.requests.clear()
        self.responses.clear()

    def body_of(self, suffix):
        return next((b for u, b in self.requests if u.endswith(suffix)), None)

    def preview(self):
        return next((v for k, v in self.responses.items() if k.endswith("/preview")), (None, None))

    def posted(self):
        return next((v for k, v in self.responses.items() if k.endswith("/checkout-return")), (None, None))


def thanh_toan(page):
    page.click('button[aria-label="Thanh toán"]')
    try:
        page.wait_for_selector('button:has-text("Có")', timeout=4000)
        page.click('button:has-text("Có")')
    except Exception:
        pass
    page.wait_for_timeout(4000)


def receipt_from_iframe(page, ctx, png: str):
    page.wait_for_selector('iframe[aria-hidden="true"]', state="attached", timeout=15000)
    page.wait_for_timeout(1500)
    frame = next((f for f in page.frames if f != page.main_frame and "col-name" in f.content()), None)
    if frame is None:
        raise RuntimeError("receipt iframe not found")
    html = frame.content()
    tmp = OUT / (png + ".html")
    tmp.write_text(html, encoding="utf-8")
    rp = ctx.new_page()
    rp.set_viewport_size({"width": 480, "height": 1000})
    rp.goto(tmp.as_uri(), wait_until="load")
    rp.wait_for_timeout(400)
    rp.screenshot(path=str(OUT / png), full_page=True)
    rows = []
    for tr in rp.locator("table tr:has(td.col-name)").all():
        name_cell = tr.locator("td.col-name")
        rows.append({
            "name": name_cell.evaluate("el => el.firstChild && el.firstChild.textContent.trim()"),
            "subs": name_cell.locator("div.line-sub").all_inner_texts(),
            "total": tr.locator("td.col-total").inner_text().strip(),
        })
    text = " ".join(rp.locator("body").inner_text().split())
    rp.close()
    tmp.unlink()
    page.evaluate(
        "() => document.querySelectorAll('iframe[aria-hidden=\"true\"]').forEach(f => {"
        " const w = f.contentWindow; if (w && typeof w.onafterprint === 'function') w.onafterprint(new Event('afterprint')); else f.remove(); })"
    )
    page.wait_for_timeout(300)
    return rows, text


def main():
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="vi-VN")
        ctx.add_init_script("window.print = () => {};")
        page = login(ctx)
        wire = Wire(page)

        # Engine facts for the expectations.
        evals = []
        page.on("response", lambda r: evals.append(r) if "/v2/promotions/evaluate" in r.url else None)
        add_sku(page, "SKU-685")
        page.wait_for_timeout(800)
        body = json.loads(evals[-1].text())
        prog = next(pr for pr in body["appliedPrograms"] if pr["lineDiscounts"])
        unit_disc, name_a, id_a = prog["lineDiscounts"][0]["discountAmount"], prog["name"], prog["programId"]
        gross, net = 685000, 685000 - unit_disc
        print("  engine:", name_a, unit_disc, id_a)
        check("engine: CTKM-A on SKU-685", unit_disc > 0)
        page.locator('button[aria-label^="Xóa"]').first.click()
        settle(page)

        # ── 0. what /v2/promotions/evaluate receives on each tab (AC-20 / AC-26) ─
        eval_bodies = []
        page.on("request", lambda r: eval_bodies.append(json.loads(r.post_data or "{}")) if "/v2/promotions/evaluate" in r.url and r.method == "POST" else None)
        # AC-26: sale tab, 685.000 with a 10% manual discount → manualLineDiscount 68.500
        add_sku(page, "SKU-685")
        page.locator('tr:has-text("SKU-685")').first.click(button="right")
        page.click('[role="menuitem"]:has-text("Khuyến mại")')
        page.wait_for_selector("text=Khuyến mại khác")
        page.click('button:has-text("%")')
        box = page.locator('input[aria-label="Giá trị khuyến mại"]')
        box.fill("10")
        box.press("Tab")
        page.fill('input[aria-label="Lý do khuyến mại"]', "uow04")
        page.click('button:has-text("Đồng ý")')
        page.wait_for_selector("text=Khuyến mại khác", state="detached")
        settle(page)
        page.wait_for_timeout(800)
        sale_body = eval_bodies[-1]
        check("AC-26 percent manual discount reaches evaluate as manualLineDiscount 68.500", sale_body["lines"][0].get("manualLineDiscount") == 68500, str(sale_body))
        page.locator('button[aria-label^="Xóa"]').first.click()
        settle(page)
        # AC-20: invoice-return tab with 1 return + 2 bought lines → exactly the 2 bought lines
        code = post_sale(page)
        open_return_for(page, code)
        eval_bodies.clear()
        add_sku(page, "SKU-100")
        add_sku(page, "SKU-685")
        page.wait_for_timeout(800)
        ret_body = eval_bodies[-1]
        ret_items = [l["itemId"] for l in ret_body["lines"]]
        check("AC-20 invoice-return evaluate carries the 2 bought lines only (return line absent)", len(ret_items) == 2 and sorted(ret_items) == sorted([SKU100_ID, SKU685_ID]), str(ret_items))
        # AC-20: quick exchange → the bought line only; a return-only cart still calls with lines: []
        page.goto(f"{page.url.split('/pos')[0]}/pos/return-goods", wait_until="domcontentloaded")
        page.click('button:has-text("Đổi trả nhanh")')
        page.wait_for_selector('[role="tablist"][aria-label="Đổi trả nhanh"]', timeout=30000)
        page.click('[role="tab"]:has-text("Trả hàng")')
        eval_bodies.clear()
        add_sku(page, "SKU-100")
        page.wait_for_timeout(800)
        only_return = eval_bodies[-1] if eval_bodies else None
        check("AC-20 return-only cart still calls evaluate with lines: []", only_return is not None and only_return.get("lines") == [], str(only_return))
        page.click('[role="tab"]:has-text("Mua thêm")')
        eval_bodies.clear()
        add_sku(page, "SKU-685")
        page.wait_for_timeout(800)
        quick_body = eval_bodies[-1]
        check("AC-20 quick-exchange evaluate carries the bought line only", [l["itemId"] for l in quick_body["lines"]] == [SKU685_ID], str(quick_body))
        (OUT / "X-00-evaluate-wire-ac20-ac26.json").write_text(json.dumps({"sale_percent_manual": sale_body, "invoice_return": ret_body, "quick_return_only": only_return, "quick_exchange": quick_body}, ensure_ascii=False, indent=1))
        # Fresh SALE tab for the scenarios below (the quick-exchange tab stays
        # parked; every later post_sale() runs on the tab "Thêm hóa đơn" opens).
        page.click('[aria-label="Thêm hóa đơn"]')
        page.wait_for_selector('button[aria-label="Thu tiền"]', timeout=15000)
        settle(page)

        # ── 1. return S + buy SKU-685, promotion applied ───────────────────────
        code = post_sale(page)
        open_return_for(page, code)
        add_sku(page, "SKU-685")
        page.click('button[aria-label="Voucher / quà tặng"]')
        page.wait_for_selector(GRID, timeout=15000)
        page.wait_for_timeout(800)
        rows = modal_rows(page)
        print("  modal:", rows)
        a = next((r for r in rows if name_a in r["name"]), None)
        check("AC-21 modal lists CTKM-A as Đã áp dụng on the exchange tab", a is not None and a["status"] == "Đã áp dụng", str(rows))
        page.screenshot(path=str(OUT / "X-01-modal-applied-ac21.png"))
        lib.close_modal(page)

        b, r = bought_row(page, "SKU-685"), return_row(page, "SKU-685")
        pn = panel(page)
        print("  bought:", b, "return:", r, "panel:", pn, "refund:", summary_row(page, "Trả lại khách"))
        check("AC-22 bought line label + strike/net", b is not None and b["labels"] == [f"{name_a} ({fmt(unit_disc)})"] and b["struck"] == fmt(gross) and b["net"] == fmt(net), str(b))
        check("AC-22 return line has only its snapshot label, none from the preview", r is not None and r["preview_labels"] == [] and len(r["return_labels"]) == 1, str(r))
        page.screenshot(path=str(OUT / "X-02-line-ac22.png"))
        check("AC-23 Tổng tiền 0", pn["tong"] == "0", str(pn))
        check("AC-23 no positive Còn phải thu / Trả lại khách", (pn["due"] in (None, "0")) and summary_row(page, "Trả lại khách") in (None, "0"), f"{pn} {summary_row(page, 'Trả lại khách')}")
        page.screenshot(path=str(OUT / "X-03-panel-zero-ac23.png"))

        # The exchange tab has no "In tạm tính" button (PaymentCTAButtons hides
        # it and the Alt+P hotkey is disabled for return/exchange), so the print
        # is the invoice printed right after Thanh toán — same receipt builder.
        toggle = page.locator('[aria-label="In hóa đơn"]').first
        if toggle.get_attribute("aria-checked") != "true":
            toggle.click()
        wire.reset()
        thanh_toan(page)
        prows, ptext = receipt_from_iframe(page, ctx, "X-04-receipt-ac27.png")
        print("  receipt rows:", prows)
        bought = [x for x in prows if x["subs"]]
        check("AC-27 bought line on the print carries the label and 616.500", any(x["subs"] == [f"{name_a} ({fmt(unit_disc)})"] and x["total"] == fmt(net) for x in prows), str(prows))
        check("AC-27 only one labelled line (return block unlabelled)", len(bought) == 1, str(prows))
        toggle = page.locator('[aria-label="In hóa đơn"]').first
        if toggle.count() and toggle.get_attribute("aria-checked") == "true":
            toggle.click()
        pv, posted = wire.preview(), wire.posted()
        cr = wire.body_of("/checkout-return")
        print("  preview:", pv, "| body:", cr, "| posted:", posted[0])
        check("AC-24 (1) preview netAmount 0", pv[0] == 200 and pv[1] and pv[1]["netAmount"] == 0, str(pv))
        check("AC-24 (1) body OFFSET, no payments, no ids", cr is not None and cr.get("refundMethod") == "OFFSET" and "payments" not in cr and "selectedProgramIds" not in cr and "excludedProgramIds" not in cr, str(cr))
        check("AC-24 (1) posted 201", posted[0] == 201, str(posted))
        (OUT / "X-05-payload-offset-ac24.json").write_text(json.dumps({"preview": pv[1], "body": cr, "status": posted[0]}, ensure_ascii=False, indent=1))
        page.wait_for_timeout(1500)

        # ── 2. as 1 but CTKM-A un-ticked ─────────────────────────────────────
        # Un-ticking CTKM-A frees SKU-685 for CTKM-B (invoice 10% NON_PROMO_ONLY),
        # which then takes the same 68.500 on the panel's "Khuyến mại" row and in
        # the BE preview (netAmount stays 0) — so CTKM-B is un-ticked too, and the
        # residual the customer owes is exactly CTKM-A's unit discount.
        code = post_sale(page)
        open_return_for(page, code)
        add_sku(page, "SKU-685")
        rows = exclude_in_modal(page, name_a)
        a = next((r for r in rows if name_a in r["name"]), None)
        check("AC-21 un-tick → Đã bỏ áp dụng", a is not None and a["status"] == "Đã bỏ áp dụng", str(rows))
        b_after_a = bought_row(page, "SKU-685")
        check("AC-21 CTKM-A label gone from the bought line", b_after_a is not None and not any(name_a in l for l in b_after_a["labels"]), str(b_after_a))
        rows = exclude_in_modal(page, "CTKM-B")
        b, pn = bought_row(page, "SKU-685"), panel(page)
        print("  bought:", b, "panel:", pn)
        check("AC-21 no label at all once both are un-ticked", b is not None and b["labels"] == [], str(b))
        check("AC-23 Còn phải thu = unit discount", pn["due"] == fmt(unit_disc), str(pn))
        page.screenshot(path=str(OUT / "X-06-panel-excluded-ac23.png"))
        wire.reset()
        thanh_toan(page)
        pv, posted, cr = wire.preview(), wire.posted(), wire.body_of("/checkout-return")
        print("  preview:", pv, "| body:", cr, "| posted:", posted[0])
        paid = sum(x["amount"] for x in (cr or {}).get("payments", []))
        check("AC-24 (2) preview netAmount = unit discount", pv[1] and pv[1]["netAmount"] == unit_disc, str(pv))
        check("AC-24 (2) body payments Σ = unit discount + excludedProgramIds ∋ CTKM-A", cr is not None and paid == unit_disc and id_a in (cr.get("excludedProgramIds") or []), str(cr))
        check("AC-24 (2) posted 201 netAmount = unit discount", posted[0] == 201 and posted[1] and int(float(posted[1]["netAmount"])) == unit_disc, str(posted))
        (OUT / "X-07-payload-excluded-ac24.json").write_text(json.dumps({"preview": pv[1], "body": cr, "status": posted[0]}, ensure_ascii=False, indent=1))
        page.wait_for_timeout(1500)

        # ── 3. return S + buy SKU-100 → refund of the difference ──────────────
        # SKU-100 carries no item promotion, so CTKM-B (invoice 10%) applies to
        # it: the refund is 616.500 − (100.000 − 10.000) = 526.500. The point of
        # the scenario is that the panel and the BE quote the same number, and
        # that the return side is priced on refundableUnitPrice (616.500), not
        # on the 685.000 list price the old FE formula used.
        code = post_sale(page)
        open_return_for(page, code)
        add_sku(page, "SKU-100")
        refund = summary_row(page, "Trả lại khách")
        print("  refund row:", refund, "panel:", panel(page))
        wire.reset()
        thanh_toan(page)
        pv, posted, cr = wire.preview(), wire.posted(), wire.body_of("/checkout-return")
        print("  preview:", pv, "| body:", cr, "| posted:", posted[0])
        check("AC-24 (3) preview prices the return side at refundableUnitPrice (returnedNet = net)", pv[1] and pv[1]["returnedNet"] == net, str(pv))
        check("AC-24 (3) preview refundedAmount = returnedNet − newNet", pv[1] and pv[1]["refundedAmount"] == pv[1]["returnedNet"] - pv[1]["newNet"] and pv[1]["newNet"] == 100000 - pv[1]["newPromotionDiscount"], str(pv))
        check("AC-24 (3) panel Trả lại khách = BE refundedAmount", pv[1] and refund == fmt(pv[1]["refundedAmount"]), f"{refund} vs {pv}")
        check("AC-24 (3) body is a refund (no payments)", cr is not None and "payments" not in cr and cr.get("refundMethod") in ("CASH", "BANK"), str(cr))
        check("AC-24 (3) posted 201 refundedAmount = preview", posted[0] == 201 and posted[1] and pv[1] and int(float(posted[1]["refundedAmount"])) == pv[1]["refundedAmount"], str(posted[1] and posted[1].get("refundedAmount")))
        (OUT / "X-08-refund-net-ac24.json").write_text(json.dumps({"preview": pv[1], "body": cr, "status": posted[0]}, ensure_ascii=False, indent=1))
        page.wait_for_timeout(1500)

        # ── 4a. AC-25: POS evaluate down → still posts, numbers from the BE ──
        code = post_sale(page)
        open_return_for(page, code)
        page.route("**/v2/promotions/evaluate", lambda route: route.abort())
        add_sku(page, "SKU-685")
        page.wait_for_timeout(1500)
        b, pn = bought_row(page, "SKU-685"), panel(page)
        print("  evaluate down — bought:", b, "panel:", pn)
        check("AC-25a panel lacks the label while evaluate is down", b is not None and b["labels"] == [], str(b))
        page.screenshot(path=str(OUT / "X-09-evaluate-down-still-posts-ac25.png"))
        wire.reset()
        thanh_toan(page)
        pv, posted, cr = wire.preview(), wire.posted(), wire.body_of("/checkout-return")
        print("  preview:", pv, "| body:", cr, "| posted:", posted[0])
        check("AC-25a still posts: exchanges → preview (netAmount 0) → checkout-return OFFSET", wire.body_of("/exchanges") is not None and pv[1] and pv[1]["netAmount"] == 0 and cr is not None and cr.get("refundMethod") == "OFFSET" and posted[0] == 201, f"{pv} {cr} {posted[0]}")
        pid = posted[1]["id"] if posted[1] else None
        promo = sql(f"SELECT promotion_discount FROM invoice_items WHERE invoice_id='{pid}' AND direction='OUT'") if pid else None
        check("AC-25a posted OUT line promotion_discount = unit discount (DB)", promo is not None and int(float(promo)) == unit_disc, str(promo))
        (OUT / "X-10-payload-ac25.json").write_text(json.dumps({"preview": pv[1], "body": cr, "status": posted[0], "db_out_promotion_discount": promo}, ensure_ascii=False, indent=1))
        page.unroute("**/v2/promotions/evaluate")
        page.wait_for_timeout(1500)

        # ── 4b. AC-25: preview down → toast, no checkout-return ──────────────
        code = post_sale(page)
        open_return_for(page, code)
        add_sku(page, "SKU-685")
        page.route("**/checkout-return/preview", lambda route: route.abort())
        wire.reset()
        page.click('button[aria-label="Thanh toán"]')
        try:
            page.wait_for_selector('button:has-text("Có")', timeout=4000)
            page.click('button:has-text("Có")')
        except Exception:
            pass
        page.wait_for_selector('[data-sonner-toast][data-type="error"]', timeout=15000)
        toast = " ".join(page.locator('[data-sonner-toast][data-type="error"]').first.inner_text().split())
        page.wait_for_timeout(2000)
        print("  toast:", toast, "| requests:", [u for u, _ in wire.requests])
        check("AC-25b error toast names the preview", "Không lấy được số tiền đổi trả" in toast, toast)
        check("AC-25b no checkout-return request", wire.body_of("/checkout-return") is None, str([u for u, _ in wire.requests]))
        page.screenshot(path=str(OUT / "X-11-preview-down-blocked-ac25.png"))
        page.unroute("**/checkout-return/preview")

        browser.close()
    sys.exit(lib.result_exit())


if __name__ == "__main__":
    main()
