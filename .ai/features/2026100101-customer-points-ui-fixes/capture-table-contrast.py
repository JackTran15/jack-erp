"""
Evidence capture for UOW-02 (table row contrast) of 2026100101-customer-points-ui-fixes.

:3000 serves the erp2 checkout on this machine, so the erp3 code runs from a second Vite:
    cd apps/backoffice-web && ./node_modules/.bin/vite --port 3005 --strictPort

Checks colours from the DOM, not only by eye: computed background of the <tr> and of every
sticky (frozen) cell in that row, for the striped / hover / selected states.

    ~/.venvs/aidlc-verify/bin/python .ai/features/2026100101-customer-points-ui-fixes/capture-table-contrast.py [BASE_URL] [step ...]

Steps: imports (= items list), orders, roles, dark, promo (default: all but orders — no orders on erp_dev_3008). Writes PNGs + summary.json to evidence/.
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
CRED = ROOT / ".ai" / "credentials.env"
import os
OUT = HERE / "evidence" / os.environ.get("EVIDENCE_SUBDIR", "uow-02")
BASE = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].startswith("http") else "http://localhost:3005"
STEPS = [a for a in sys.argv[1:] if not a.startswith("http")] or ["imports", "roles", "dark", "promo", "report"]

results = {}


def creds():
    values = {}
    for line in CRED.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        values[k.strip()] = v.strip().strip('"')
    return values


def record(key, ok, **detail):
    results[key] = {"ok": bool(ok), **detail}
    print(("PASS " if ok else "FAIL ") + key, json.dumps(detail, ensure_ascii=False))


def token(page, name):
    """Resolve an HSL token to the rgb() string the browser computes for it."""
    return page.evaluate(
        """name => { const d = document.createElement('div');
            d.style.background = `hsl(var(${name}))`; document.body.appendChild(d);
            const c = getComputedStyle(d).backgroundColor; d.remove(); return c; }""",
        name,
    )


def row_colors(page, row):
    return row.evaluate(
        """tr => ({
            row: getComputedStyle(tr).backgroundColor,
            frozen: [...tr.querySelectorAll('td')].filter(td => getComputedStyle(td).position === 'sticky')
                      .map(td => getComputedStyle(td).backgroundColor),
        })"""
    )


def body_rows(page, table_sel="table"):
    return page.locator(f"{table_sel} tbody tr").filter(has=page.locator("td:nth-child(2)"))


def login(page):
    c = creds()
    page.goto(f"{BASE}/login", wait_until="domcontentloaded", timeout=30000)
    page.fill("#login-org-id", c["LOCAL_BACKOFFICE_ORG_ID"])
    page.fill("#login-email", c["LOCAL_BACKOFFICE_EMAIL"])
    page.fill("#login-password", c["LOCAL_BACKOFFICE_PASSWORD"])
    page.click('button[type="submit"]')
    page.wait_for_url(lambda u: "/login" not in u, timeout=30000)
    page.wait_for_selector("text=Đang khôi phục phiên", state="detached", timeout=30000)


def check_states(page, name, select=None, first=0):
    """Stripes, hover, (optional) selected + hover-on-selected for the first data table."""
    rows = body_rows(page)
    rows.first.wait_for(timeout=30000)
    even, odd = token(page, "--table-row-even"), token(page, "--table-row-odd")
    hover, selected = token(page, "--table-row-hover"), token(page, "--table-row-selected")
    page.mouse.move(0, 0)
    r0, r1 = row_colors(page, rows.nth(first)), row_colors(page, rows.nth(first + 1))
    page.screenshot(path=str(OUT / f"{name}-1-stripes.png"))
    record(f"{name}.stripes", r0["row"] == even and r1["row"] == odd
           and all(c == even for c in r0["frozen"]) and all(c == odd for c in r1["frozen"]),
           even=r0, odd=r1, expect=[even, odd])

    rows.nth(2).hover()
    page.wait_for_timeout(150)
    rh = row_colors(page, rows.nth(2))
    page.screenshot(path=str(OUT / f"{name}-2-hover.png"))
    record(f"{name}.hover", rh["row"] == hover and all(c == hover for c in rh["frozen"]), got=rh, expect=hover)

    if select is None:
        return
    target = select(rows)
    page.mouse.move(0, 0)
    page.wait_for_timeout(300)
    rs = row_colors(page, target)
    page.screenshot(path=str(OUT / f"{name}-3-selected.png"))
    record(f"{name}.selected", rs["row"] == selected and all(c == selected for c in rs["frozen"]), got=rs, expect=selected)
    target.hover()
    page.wait_for_timeout(150)
    rsh = row_colors(page, target)
    page.screenshot(path=str(OUT / f"{name}-4-selected-hover.png"))
    record(f"{name}.selected_hover", rsh["row"] == selected, got=rsh, expect=selected)


def click_row(index):
    def _sel(rows):
        rows.nth(index).locator("td").nth(2).click()
        return rows.nth(index)
    return _sel


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        login(page)
        if "imports" in STEPS:
            # Danh mục hàng hóa: luôn có dữ liệu (Nhập hàng lọc theo tháng nên thường trống).
            page.goto(f"{BASE}/admin/inventory-items", wait_until="networkidle")
            body_rows(page).first.wait_for(timeout=30000)
            # Cột ghim chỉ có ở màn Đơn hàng, mà DB local không có đơn. Mô phỏng: gán cho ô thứ 2
            # của mọi dòng đúng inline style BaseDataTable đặt cho ô ghim (FROZEN_BODY_BG), rồi
            # kiểm nó theo màu dòng. Kết quả ghi rõ là mô phỏng.
            page.evaluate("""() => document.querySelectorAll('table tbody tr td:nth-child(2)').forEach(td => {
                td.style.position = 'sticky'; td.style.left = '36px'; td.style.backgroundColor = 'hsl(var(--row-bg))'; })""")
            # Hàng hoá tự tick dòng đầu (từ UOW-05 dòng tick tô tím) → đo sọc ở dòng 3-4.
            check_states(page, "items-simulated-frozen", first=2)
        if "orders" in STEPS:
            page.goto(f"{BASE}/orders/all", wait_until="networkidle")
            check_states(page, "orders", select=click_row(1))
        if "roles" in STEPS:
            page.goto(f"{BASE}/role-management", wait_until="networkidle")
            check_states(page, "roles", select=click_row(2))
        if "report" in STEPS:
            # AC-22: báo cáo (ReportPageTableView). Mở rộng khoảng ngày để có dữ liệu, cột "Ngày" là cột ghim thật.
            page.goto(f"{BASE}/reports/sales", wait_until="networkidle")
            dates = page.locator("input[type='date']")
            dates.nth(0).fill("2025-01-01")
            dates.nth(1).fill("2026-12-31")
            page.click("button:has-text('Lấy dữ liệu')")
            page.wait_for_load_state("networkidle")
            check_states(page, "report")
        if "dark" in STEPS:
            page.goto(f"{BASE}/role-management", wait_until="networkidle")
            page.evaluate("() => document.documentElement.setAttribute('data-theme', 'dark')")
            check_states(page, "roles-dark", select=click_row(2))
        if "promo" in STEPS:
            # CTKM Giảm giá hàng hóa có nhiều dòng nhất trên erp_dev_3008 (truyền id khác qua PROMO_ID).
            import os
            pid = os.environ.get("PROMO_ID", "923525f9-2477-4e64-b67f-22e1ff0dd9a2")
            page.goto(f"{BASE}/promotions/programs/{pid}/edit", wait_until="networkidle")
            rows = page.locator("table tbody tr").filter(has=page.locator("input"))
            rows.first.wait_for(timeout=30000)
            even, odd = token(page, "--table-row-even"), token(page, "--table-row-odd")
            hover = token(page, "--table-row-hover")
            page.mouse.move(0, 0)
            r0, r1 = row_colors(page, rows.nth(0)), row_colors(page, rows.nth(1))
            record("promo.stripes", r0["row"] == even and r1["row"] == odd, even=r0, odd=r1, expect=[even, odd])
            rows.nth(1).hover()
            page.wait_for_timeout(150)
            rh = row_colors(page, rows.nth(1))
            page.screenshot(path=str(OUT / "promo-line-item-grid-hover.png"))
            record("promo.hover", rh["row"] == hover, got=rh, expect=hover)
        browser.close()
    (OUT / "summary.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    sys.exit(0 if all(r["ok"] for r in results.values()) else 1)


if __name__ == "__main__":
    main()
