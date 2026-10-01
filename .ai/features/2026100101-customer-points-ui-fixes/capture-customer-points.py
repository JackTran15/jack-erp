"""
Evidence capture for UOW-01 (member points) of 2026100101-customer-points-ui-fixes.

Runs against the erp3 Vite on :3005 (see capture-table-contrast.py). WRITES to the dev DB:
adjusts the chosen customer's points to current+80, then sets them back — two ADJUST rows
land in point_history (an append-only ledger; there is no undo, and this is a dev DB).

"No permission" is simulated by stripping the two point keys from every /auth/* response
the browser receives, so no role in the DB is touched.

    CUSTOMER_ID=<uuid> ~/.venvs/aidlc-verify/bin/python .ai/features/2026100101-customer-points-ui-fixes/capture-customer-points.py [BASE_URL]
"""
import importlib.util
import json
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("cap", HERE / "capture-table-contrast.py")
cap = importlib.util.module_from_spec(spec)
argv, sys.argv = sys.argv, sys.argv[:1]
spec.loader.exec_module(cap)
sys.argv = argv

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3005"
cap.BASE = BASE
OUT = HERE / "evidence" / "uow-01"
CUSTOMER_ID = os.environ.get("CUSTOMER_ID", "93937ee9-5038-4cfa-a6f0-2e07fb044712")
POINT_KEYS = {"customer.points.adjust", "customer.points.history.read"}


def strip_keys(obj):
    if isinstance(obj, dict):
        return {k: (sorted(set(v) - POINT_KEYS) if k == "permissions" and isinstance(v, list) else strip_keys(v))
                for k, v in obj.items()}
    if isinstance(obj, list):
        return [strip_keys(v) for v in obj]
    return obj


# route.fetch resolves localhost to ::1 first; the dev API listens on IPv4 only.
def without_point_permissions(route):
    resp = route.fetch(url=route.request.url.replace('//localhost:4000', '//127.0.0.1:4000'))
    try:
        body = json.dumps(strip_keys(resp.json()))
    except Exception:
        return route.fulfill(response=resp)
    route.fulfill(response=resp, body=body, headers={**resp.headers, "content-type": "application/json"})


def panel_points(page):
    txt = page.locator("dt:has-text('Điểm tích lũy') + dd").inner_text()
    return int("".join(ch for ch in txt if ch.isdigit()))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()

        # ── Admin: holds both keys ─────────────────────────────────────────────
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        cap.login(page)
        page.goto(f"{BASE}/admin/customers/{CUSTOMER_ID}", wait_until="networkidle")
        page.locator("text=Mã thẻ").wait_for(timeout=30000)
        card = page.locator("dt:has-text('Mã thẻ') + dd").inner_text()
        before = panel_points(page)
        page.screenshot(path=str(OUT / "1-detail-panel.png"), full_page=True)
        cap.record("AC-01.detail", bool(card) and page.locator("button:has-text('Điều chỉnh điểm')").count() == 1,
                   cardNumber=card, points=before)

        page.goto(f"{BASE}/admin/customers/{CUSTOMER_ID}/edit", wait_until="networkidle")
        page.locator("text=Mã thẻ").wait_for(timeout=30000)
        edit_card = page.locator("dt:has-text('Mã thẻ') + dd").inner_text()
        page.screenshot(path=str(OUT / "2-edit-panel.png"), full_page=True)
        cap.record("AC-01.edit", edit_card == card and page.locator("dd input").count() == 0, cardNumber=edit_card)

        # AC-09: adjust to before+80 from the edit page, panel refreshes without reload.
        page.click("button:has-text('Điều chỉnh điểm')")
        page.fill("#adjust-points-value", str(before + 80))
        page.fill("#adjust-points-note", "Bù điểm (kiểm chứng UOW-01)")
        page.screenshot(path=str(OUT / "3-adjust-dialog.png"))
        page.click("button:has-text('Lưu'):visible >> nth=-1")
        page.locator("[data-sonner-toast]:has-text('Đã cập nhật điểm')").wait_for(timeout=15000)
        page.wait_for_function(
            "expected => [...document.querySelectorAll('dt')].some(dt => dt.textContent.includes('Điểm tích lũy')"
            " && dt.nextElementSibling.textContent.replace(/\\D/g,'') === String(expected))",
            arg=before + 80, timeout=15000,
        )
        page.screenshot(path=str(OUT / "4-after-adjust.png"), full_page=True)
        cap.record("AC-09.adjust", panel_points(page) == before + 80, before=before, after=panel_points(page))

        # T-01-06: history tab, newest row is the adjustment just made.
        page.goto(f"{BASE}/admin/customers/{CUSTOMER_ID}", wait_until="networkidle")
        tab = page.locator("[role='tab']:has-text('Lịch sử điểm'), button:has-text('Lịch sử điểm')").first
        if tab.count():
            tab.click()
            first = page.locator("text=Lịch sử điểm").locator("xpath=following::table[1]//tbody/tr[1]")
            first.wait_for(timeout=15000)
            row = first.inner_text()
            page.screenshot(path=str(OUT / "5-history-tab.png"), full_page=True)
            cap.record("AC-12.history_admin", "Điều chỉnh" in row and "+80" in row and "kiểm chứng" in row, firstRow=row)
        else:
            cap.record("AC-12.history_admin", False, reason="no 'Lịch sử điểm' tab")

        # Restore the original balance (second ADJUST row, -80).
        page.goto(f"{BASE}/admin/customers/{CUSTOMER_ID}", wait_until="networkidle")
        page.click("button:has-text('Điều chỉnh điểm')")
        page.fill("#adjust-points-value", str(before))
        page.fill("#adjust-points-note", "Hoàn lại sau kiểm chứng UOW-01")
        page.click("button:has-text('Lưu'):visible >> nth=-1")
        page.locator("[data-sonner-toast]:has-text('Đã cập nhật điểm')").wait_for(timeout=15000)
        cap.record("restore", True, points=before)
        page.close()

        # ── Same account with the two keys stripped from the session (AC-06, AC-12) ──
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        ctx.route("http://localhost:4000/auth/**", without_point_permissions)
        page = ctx.new_page()
        cap.login(page)
        page.goto(f"{BASE}/admin/customers/{CUSTOMER_ID}", wait_until="networkidle")
        page.locator("text=Mã thẻ").wait_for(timeout=30000)
        page.screenshot(path=str(OUT / "6-no-permission.png"), full_page=True)
        cap.record("AC-06.no_adjust_button", page.locator("button:has-text('Điều chỉnh điểm')").count() == 0)
        cap.record("AC-12.no_history_tab", page.locator("text=Lịch sử điểm").count() == 0)

        # ── AC-07: no customer in the org lacks a card (creating one issues it), so stub the
        # summary with membership=null — the exact state the panel renders for a cardless one.
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        def no_card(route):
            resp = route.fetch(url=route.request.url.replace('//localhost:4000', '//127.0.0.1:4000'))
            body = {**resp.json(), "membership": None}
            route.fulfill(response=resp, body=json.dumps(body), headers={**resp.headers, "content-type": "application/json"})
        ctx.route(f"http://localhost:4000/customers/{CUSTOMER_ID}/summary", no_card)
        page = ctx.new_page()
        cap.login(page)
        page.goto(f"{BASE}/admin/customers/{CUSTOMER_ID}", wait_until="networkidle")
        page.locator("text=Chưa có thẻ").first.wait_for(timeout=30000)
        page.screenshot(path=str(OUT / "7-no-card-stubbed.png"), full_page=True)
        cap.record("AC-07.no_card_ui", page.locator("button:has-text('Điều chỉnh điểm')").count() == 0
                   and page.locator("button:has-text('Cấp thẻ thành viên')").count() == 1, simulated=True)
        browser.close()
    (OUT / "summary.json").write_text(json.dumps(cap.results, ensure_ascii=False, indent=2), encoding="utf-8")
    sys.exit(0 if all(r["ok"] for r in cap.results.values()) else 1)


if __name__ == "__main__":
    main()
