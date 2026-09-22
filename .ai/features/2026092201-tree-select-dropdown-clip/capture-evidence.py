"""
Evidence capture for 2026092201-tree-select-dropdown-clip.

Why a script and not ai-dlc-verify: the `local-backoffice` environment is pinned to
:3000, which on this machine serves the erp2 checkout; the fixed code runs from a
second Vite on :3005 (`cd apps/backoffice-web && ./node_modules/.bin/vite --port 3005
--strictPort`). The runner has no URL override, and the checks here need geometry
(popover vs. dialog vs. viewport) that its assert grammar cannot express.

Reads LOCAL_BACKOFFICE_ORG_ID / _EMAIL / _PASSWORD from `.ai/credentials.env`.
Writes screenshots + `summary.json` to `evidence/` (git-ignored).

    ~/.venvs/aidlc-verify/bin/python .ai/features/2026092201-tree-select-dropdown-clip/capture-evidence.py [BASE_URL]
"""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
CRED = ROOT / ".ai" / "credentials.env"
OUT = HERE / "evidence"
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3005"
POP = "[data-lookup-popover]"
OPT = f"{POP} li[role='option']"

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


def rect(page, selector):
    return page.eval_on_selector(
        selector,
        "el => { const r = el.getBoundingClientRect(); return {top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height}; }",
    )


def record(key, ok, **detail):
    results[key] = {"ok": bool(ok), **detail}
    print(("PASS " if ok else "FAIL ") + key, json.dumps(detail, ensure_ascii=False))


def login(page):
    c = creds()
    page.goto(f"{BASE}/login", wait_until="domcontentloaded", timeout=30000)
    page.fill("#login-org-id", c["LOCAL_BACKOFFICE_ORG_ID"])
    page.fill("#login-email", c["LOCAL_BACKOFFICE_EMAIL"])
    page.fill("#login-password", c["LOCAL_BACKOFFICE_PASSWORD"])
    page.click('button[type="submit"]')
    page.wait_for_url(lambda u: "/login" not in u, timeout=30000)
    page.wait_for_selector("text=Đang khôi phục phiên", state="detached", timeout=30000)


def open_edit(page, row_text):
    page.goto(f"{BASE}/admin/cash-voucher-categories", wait_until="domcontentloaded")
    page.wait_for_selector("table tbody tr", timeout=30000)
    # Clicking a row only selects it; the name cell (or the Sửa toolbar button) opens the edit dialog.
    page.click(f'table tbody tr:has-text("{row_text}") >> nth=0')
    page.click('button:has-text("Sửa")')
    page.wait_for_selector("#field-parentGroupId", timeout=15000)


def open_parent_list(page):
    page.click("#field-parentGroupId")
    page.wait_for_selector(OPT, timeout=15000)


def cancel(page):
    if page.locator(POP).count():
        page.click('label:has-text("Mô tả")')
        page.wait_for_selector(POP, state="detached", timeout=5000)
    page.click('button:has-text("Hủy bỏ")')
    page.wait_for_selector('[role="dialog"]', state="detached", timeout=5000)


def within(inner, outer, tol=1):
    return (inner["top"] >= outer["top"] - tol and inner["bottom"] <= outer["bottom"] + tol
            and inner["left"] >= outer["left"] - tol and inner["right"] <= outer["right"] + tol)


def viewport_rect(page):
    vs = page.viewport_size
    return {"top": 0, "left": 0, "bottom": vs["height"], "right": vs["width"]}


def wait_options_settle(page, timeout_ms=8000):
    """Wait until no 'Đang tải' row remains and the option count stops changing."""
    page.wait_for_function(
        "() => !document.querySelector('[data-lookup-popover] li:not([role])')?.textContent?.includes('Đang tải')",
        timeout=timeout_ms,
    )
    prev = -1
    for _ in range(20):
        n = page.locator(OPT).count()
        if n == prev:
            return n
        prev = n
        page.wait_for_timeout(250)
    return prev


def ac01_ac04(page):
    page.set_viewport_size({"width": 1440, "height": 900})
    open_edit(page, "Thu khác")
    # Count window scroll/resize listeners added vs removed across open → close (no leak).
    page.evaluate("""() => {
      window.__lc = {added: 0, removed: 0};
      const add = window.addEventListener.bind(window), rem = window.removeEventListener.bind(window);
      window.addEventListener = (t, ...a) => { if (t === 'scroll' || t === 'resize') window.__lc.added++; return add(t, ...a); };
      window.removeEventListener = (t, ...a) => { if (t === 'scroll' || t === 'resize') window.__lc.removed++; return rem(t, ...a); };
    }""")
    open_parent_list(page)
    # page 2 (THU_NO_KH) must arrive without any scroll — the auto-fill effect
    page.wait_for_selector(f'{POP} li:has-text("THU_NO_KH")', timeout=15000)
    n = wait_options_settle(page)
    pop, dlg, vp = rect(page, POP), rect(page, '[role="dialog"]'), viewport_rect(page)
    body = rect(page, "form.space-y-4")
    codes = page.locator(OPT).all_inner_texts()
    page.screenshot(path=str(OUT / "AC-01-thu-khac-parent-list-desktop.png"))
    footer = rect(page, 'button:has-text("Hủy bỏ")')
    field = rect(page, "#field-parentGroupId")
    record("AC-01 list not clipped, 8 IN options", n == 8 and within(pop, dlg) and within(pop, vp)
           and pop["bottom"] <= footer["top"] and "THU_KHAC" not in " ".join(codes),
           options=n, popover=pop, dialog=dlg, footer_top=footer["top"],
           flipped_above=pop["bottom"] <= field["top"], codes=[c.split("\n")[0] for c in codes])

    # AC-04: pick, dialog stays; click elsewhere inside dialog, list closes, value kept
    page.click(f'{POP} li:has-text("THU_BAN_HANG")')
    page.wait_for_selector(POP, state="detached", timeout=5000)
    val = page.input_value("#field-parentGroupId")
    dialog_open = page.locator('[role="dialog"]').count() == 1
    # The input kept focus through the pick (mousedown is prevented), and the
    # list opens on focus — blur first so the second click re-focuses and opens.
    page.click('label:has-text("Mô tả")')
    page.click("#field-parentGroupId")
    page.wait_for_selector(POP, timeout=15000)
    page.click('label:has-text("Mô tả")')
    page.wait_for_selector(POP, state="detached", timeout=5000)
    val2 = page.input_value("#field-parentGroupId")
    record("AC-04 select keeps dialog; outside click closes list, keeps value",
           val.startswith("THU_BAN_HANG · Thu từ bán hàng") and dialog_open and val2 == val
           and page.locator('[role="dialog"]').count() == 1, value=val, value_after=val2)
    page.screenshot(path=str(OUT / "AC-04-selected-dialog-open.png"))
    cancel(page)
    lc = page.evaluate("window.__lc")
    record("NF no listener leak: window scroll/resize listeners removed on close",
           lc["added"] > 0 and lc["added"] == lc["removed"], **lc)


def ac02(page):
    page.set_viewport_size({"width": 1440, "height": 900})
    open_edit(page, "Chi khác")
    open_parent_list(page)
    wait_options_settle(page)
    body_scroll_before = page.eval_on_selector("form.space-y-4", "el => el.parentElement.scrollTop")
    scroller = f"{POP} div.overflow-y-auto"
    for _ in range(12):
        page.eval_on_selector(scroller, "el => { el.scrollTop = el.scrollHeight; }")
        page.wait_for_timeout(400)
        wait_options_settle(page)
        if page.locator(f"{POP} li:not([role])").count() == 0:
            break
    n = page.locator(OPT).count()
    thu = page.locator(f'{POP} li:has-text("THU_")').count()
    body_scroll_after = page.eval_on_selector("form.space-y-4", "el => el.parentElement.scrollTop")
    pop, vp = rect(page, POP), viewport_rect(page)
    page.screenshot(path=str(OUT / "AC-02-chi-khac-scrolled-to-end.png"))
    codes = [c.split("\n")[0].strip() for c in page.locator(OPT).all_inner_texts()]
    code_field = page.input_value("#field-code")
    expected = int(sys.argv[2]) if len(sys.argv) > 2 else 35  # OUT rows of the login org minus the edited one
    record("AC-02 list scrolls and pages to every other OUT option; form does not move",
           n == expected and thu == 0 and body_scroll_before == body_scroll_after and within(pop, vp)
           and pop["height"] <= 321 and code_field not in " ".join(codes),
           options=n, expected=expected, thu_options=thu, popover_height=pop["height"], editing=code_field,
           body_scroll=[body_scroll_before, body_scroll_after], codes=[c.split(" · ")[0].lstrip("— ") for c in codes])
    cancel(page)


def ac03_laptop_flip(page):
    page.set_viewport_size({"width": 1440, "height": 720})
    open_edit(page, "Thu khác")
    field = rect(page, "#field-parentGroupId")
    open_parent_list(page)
    wait_options_settle(page)
    pop, dlg, vp = rect(page, POP), rect(page, '[role="dialog"]'), viewport_rect(page)
    flipped = pop["bottom"] <= field["top"]
    page.screenshot(path=str(OUT / "AC-03-laptop-flip-above.png"))
    record("AC-03 laptop: list flips above the input, within dialog and viewport",
           flipped and within(pop, dlg) and within(pop, vp) and field["top"] - pop["bottom"] <= 8,
           field=field, popover=pop, dialog=dlg, available_below_in_dialog=dlg["bottom"] - field["bottom"] - 8)
    cancel(page)


def ac05_body_scroll(page, height=720):
    page.set_viewport_size({"width": 1440, "height": height})
    open_edit(page, "Thu khác")
    page.wait_for_selector("#field-displayOrder", timeout=10000)
    body = page.locator("form.space-y-4").locator("xpath=..")
    info = body.evaluate("el => ({overflowY: getComputedStyle(el).overflowY, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight})")
    # Wheel inside the body like a user would, then see whether the last field is reachable.
    bb = rect(page, "form.space-y-4")
    page.mouse.move(bb["left"] + 200, bb["top"] + 50)
    page.mouse.wheel(0, 1200)
    page.wait_for_timeout(300)
    f = rect(page, "#field-displayOrder")
    dlg = rect(page, '[role="dialog"]')
    footer = rect(page, 'button:has-text("Hủy bỏ")')
    scrolled = body.evaluate("el => el.scrollTop")
    reachable = f["bottom"] <= footer["top"] and f["top"] >= dlg["top"]
    overflowing = info["scrollHeight"] > info["clientHeight"] + 4
    page.screenshot(path=str(OUT / f"AC-05-h{height}-body-scrolled.png"))
    record(f"AC-05 @{height}px: modal body scrolls, Thứ tự hiển thị reachable",
           reachable and info["overflowY"] in ("auto", "scroll") and (scrolled > 0 or not overflowing),
           body=info, field=f, footer_top=footer["top"], scroll_top=scrolled, overflowing=overflowing)
    cancel(page)


def ac05_body_scroll_short(page):
    # A viewport short enough that the 8-field form does not fit the dialog body:
    # this is where an overflow-visible body left the last fields unreachable.
    ac05_body_scroll(page, height=560)


def ac06_item_categories(page):
    page.set_viewport_size({"width": 1440, "height": 900})
    page.goto(f"{BASE}/admin/inventory-item-categories", wait_until="domcontentloaded")
    page.wait_for_selector("table tbody tr", timeout=30000)
    row_text = page.locator("table tbody tr >> nth=0").inner_text().split("\n")[0]
    page.click("table tbody tr >> nth=0")
    page.click('button:has-text("Sửa")')
    page.wait_for_selector("#field-parentGroupId", timeout=15000)
    title = page.locator('[role="dialog"] h2, [role="dialog"] [class*="title"]').first.inner_text()
    open_parent_list(page)
    wait_options_settle(page)
    pop, dlg, vp = rect(page, POP), rect(page, '[role="dialog"]'), viewport_rect(page)
    n = page.locator(OPT).count()
    page.click(f"{OPT} >> nth=0")
    page.wait_for_selector(POP, state="detached", timeout=5000)
    val = page.input_value("#field-parentGroupId")
    page.screenshot(path=str(OUT / "AC-06-item-category-dialog.png"))
    body_overflow = page.locator("form.space-y-4").locator("xpath=..").evaluate("el => getComputedStyle(el).overflowY")
    record("AC-06 Nhóm hàng hoá dialog: list within dialog+viewport, pick keeps dialog, body overflow-auto",
           n > 0 and within(pop, dlg) and within(pop, vp) and val and page.locator('[role="dialog"]').count() == 1
           and body_overflow == "auto",
           options=n, picked=val, dialog_title=title, body_overflow=body_overflow)
    cancel(page)


def ac07_stock_filter_popover(page):
    page.set_viewport_size({"width": 1440, "height": 900})
    page.goto(f"{BASE}/inventory-management", wait_until="domcontentloaded")
    page.wait_for_selector('button:has-text("Bộ lọc")', timeout=30000)
    page.click('button:has-text("Bộ lọc")')
    page.wait_for_selector("#ssfd-category", timeout=15000)
    panel = rect(page, '[role="dialog"]:has(#ssfd-category)')
    page.click("#ssfd-category")
    page.wait_for_selector(OPT, timeout=15000)
    wait_options_settle(page)
    pop = rect(page, POP)
    escapes_panel = pop["bottom"] > panel["bottom"]
    page.screenshot(path=str(OUT / "AC-07-stock-filter-popover-open.png"))
    page.click(f"{OPT} >> nth=0")
    page.wait_for_selector(POP, state="detached", timeout=5000)
    panel_open = page.locator("#ssfd-category").count() == 1
    val = page.input_value("#ssfd-category") if panel_open else ""
    page.screenshot(path=str(OUT / "AC-07-stock-filter-popover-picked.png"))
    record("AC-07 Radix Popover host: list floats over panel, pick keeps panel open",
           panel_open and bool(val) and within(pop, viewport_rect(page)),
           panel=panel, popover=pop, escapes_panel=escapes_panel, picked=val)
    page.keyboard.press("Escape")


def ac08_item_create_page(page):
    page.set_viewport_size({"width": 1440, "height": 900})
    page.goto(f"{BASE}/admin/inventory-items/new", wait_until="domcontentloaded")
    page.wait_for_selector("#create-category", timeout=30000)
    field = rect(page, "#create-category")
    page.click("#create-category")
    page.wait_for_selector(OPT, timeout=15000)
    wait_options_settle(page)
    pop = rect(page, POP)
    target_is_body = page.eval_on_selector(POP, "el => el.parentElement === document.body")
    page.screenshot(path=str(OUT / "AC-08-item-create-page.png"))
    page.click(f"{OPT} >> nth=0")
    page.wait_for_selector(POP, state="detached", timeout=5000)
    val = page.input_value("#create-category")
    record("AC-08 plain page host: list right under input, same width, portaled to body",
           target_is_body and abs(pop["left"] - field["left"]) <= 1 and abs(pop["width"] - field["width"]) <= 1
           and abs(pop["top"] - field["bottom"]) <= 8 and bool(val),
           field=field, popover=pop, picked=val)


def main():
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        login(page)
        for step in (ac01_ac04, ac02, ac03_laptop_flip, ac05_body_scroll, ac05_body_scroll_short,
                     ac06_item_categories, ac07_stock_filter_popover, ac08_item_create_page):
            try:
                step(page)
            except Exception as exc:  # keep going; the summary shows what broke
                record(step.__name__, False, error=str(exc)[:400])
                page.screenshot(path=str(OUT / f"{step.__name__}-error.png"))
                page.keyboard.press("Escape")
        results["page_errors"] = errors
        (OUT / "summary.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
        browser.close()
    failed = [k for k, v in results.items() if isinstance(v, dict) and not v.get("ok")]
    print("\nFAILED:" if failed else "\nALL PASS", failed)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
