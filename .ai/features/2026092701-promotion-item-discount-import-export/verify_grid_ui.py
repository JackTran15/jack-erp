"""Headless check of the Giảm giá hàng hóa grid on the erp3 backoffice (:3005).

Credentials come from .ai/credentials.env (LOCAL_BACKOFFICE_*); nothing is printed.
Usage: ~/.venvs/aidlc-verify/bin/python verify_grid_ui.py <step>
Screenshots land in evidence/ next to this file.
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
OUT = HERE / "evidence"
OUT.mkdir(exist_ok=True)
import os
BASE = os.environ.get("VERIFY_BASE", "http://localhost:3005")


def creds() -> dict:
    env = {}
    for line in (REPO / ".ai" / "credentials.env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def login(page, env):
    page.goto(f"{BASE}/login")
    page.fill("#login-org-id", env["LOCAL_BACKOFFICE_ORG_ID"])
    page.fill("#login-email", env["LOCAL_BACKOFFICE_EMAIL"])
    page.fill("#login-password", env["LOCAL_BACKOFFICE_PASSWORD"])
    page.click('button[type="submit"]')
    page.wait_for_url(lambda u: "/login" not in u, timeout=30000)
    page.wait_for_selector("text=Đang khôi phục phiên", state="detached", timeout=30000)


def open_form(page):
    page.goto(f"{BASE}/promotions/programs/new?type=PRODUCT_DISCOUNT")
    page.wait_for_selector("text=Thiết lập", timeout=30000)


def main(step: str):
    env = creds()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        login(page, env)
        open_form(page)
        if step == "probe":
            page.screenshot(path=str(OUT / "probe-form.png"), full_page=True)
            grid = page.locator("text=Thiết lập").locator("xpath=ancestor::div[contains(@class,'rounded')][1]")
            print(grid.inner_html()[:6000])
        if step == "lookup":
            page.get_by_label("Hàng hóa", exact=True).check()
            cell = page.locator('tbody tr[data-row-index="0"] td').first.locator("input").first
            cell.click()
            cell.fill("a")
            page.wait_for_timeout(1500)
            page.screenshot(path=str(OUT / "probe-lookup.png"))
            print(page.locator("[role=listbox], [role=option], [cmdk-list], [data-radix-popper-content-wrapper]").first.inner_html()[:3000])
        if step == "copy":
            check_copy_down(page)
        if step == "save-payload":
            check_save_payload(page)
        if step == "export":
            check_export(page)
        if step == "import":
            check_import(page)
        if step == "picker-payload":
            check_picker_and_group_payload(page)
        if step == "picker-probe":
            page.get_by_label("Hàng hóa", exact=True).check()
            row(page, 0).locator("td").first.locator("button").last.click()
            page.wait_for_timeout(2000)
            page.screenshot(path=str(OUT / "probe-picker.png"))
            print(page.get_by_role("dialog").inner_html()[:5000])
        browser.close()


def row(page, i):
    return page.locator(f'tbody tr[data-row-index="{i}"]')


def pick(page, i, code):
    cell = row(page, i).locator("td").first.locator("input").first
    cell.click()
    cell.fill(code)
    page.locator('[role="option"]', has_text=code).first.click()
    page.wait_for_timeout(300)


def value_input(page, i):
    return row(page, i).locator("td").nth(2).locator("input").first


def values(page, n):
    return [value_input(page, i).input_value() for i in range(n)]


def copy_btn(page, i):
    return row(page, i).get_by_label("Sao chép giá trị xuống các dòng dưới")


def check_copy_down(page):
    results = []

    def expect(label, got, want):
        ok = got == want
        results.append(ok)
        print(f"{'PASS' if ok else 'FAIL'} {label}: got={got!r} want={want!r}")

    page.get_by_label("Hàng hóa", exact=True).check()
    codes = ["ABA2777-D-38", "ABA2777-D-39", "ABA2777-D-40", "ABA2777-D-41"]
    for i, code in enumerate(codes):
        pick(page, i, code)
    for i, v in enumerate(["30", "10", "", "5"]):
        value_input(page, i).fill(v)
    expect("rows incl. trailing blank", page.locator("tbody tr[data-row-index]").count(), 5)
    expect("before", values(page, 4), ["30", "10", "", "5"])
    page.screenshot(path=str(OUT / "AC-05-before.png"))

    # AC-07 — trailing blank row has no copy icon
    expect("AC-07 blank row has no icon", copy_btn(page, 4).count(), 0)

    # AC-05
    copy_btn(page, 0).click()
    expect("AC-05 copy from row 1", values(page, 5), ["30", "30", "30", "30", ""])
    page.screenshot(path=str(OUT / "AC-05-after.png"))

    # AC-06
    value_input(page, 1).fill("10")
    copy_btn(page, 1).click()
    expect("AC-06 copy from row 2", values(page, 5), ["30", "10", "10", "10", ""])
    page.screenshot(path=str(OUT / "AC-06.png"))

    # AC-08 — Số tiền still has the column; Đồng giá hides it
    page.get_by_label("Giảm giá theo số tiền").check()
    expect("AC-08 icon present in Số tiền", copy_btn(page, 0).count(), 1)
    page.get_by_label("Đồng giá").check()
    expect("AC-08 no icon in Đồng giá", page.get_by_label("Sao chép giá trị xuống các dòng dưới").count(), 0)
    page.screenshot(path=str(OUT / "AC-08-dong-gia.png"))

    # AC-08 — Nhóm hàng hóa + Số tiền works
    page.get_by_label("Giảm giá theo số tiền").check()
    page.get_by_label("Nhóm hàng hóa", exact=True).check()
    page.wait_for_timeout(300)
    for i in range(2):
        cell = row(page, i).locator("td").first.locator("input").first
        cell.click()
        cell.fill("")
        cell.press("ArrowDown")
        page.locator('[role="option"]').nth(i).click()
        page.wait_for_timeout(300)
    value_input(page, 0).fill("50000")
    value_input(page, 1).fill("1000")
    copy_btn(page, 0).click()
    expect("AC-08 group + amount copy", [v.replace(".", "") for v in values(page, 2)], ["50000", "50000"])
    page.screenshot(path=str(OUT / "AC-08-group-amount.png"))

    print("ALL PASS" if all(results) else "SOME FAILED")



def check_save_payload(page):
    """AC-01: the save request carries targetType ITEM for a row picked in the lookup.

    The request is captured and aborted, so nothing is written to the dev DB; the
    storage side (API keeps what it is sent) is proven by the T-01-02 e2e suite.
    """
    import json

    captured = {}

    def handle(route, request):
        if request.method == "POST" and request.url.rstrip("/").endswith("/v2/promotions"):
            captured["body"] = json.loads(request.post_data or "{}")
            route.abort()
        else:
            route.continue_()

    page.route("**/v2/promotions*", handle)
    page.get_by_placeholder("Nhập tên chương trình").fill("VERIFY targetType")
    page.get_by_label("Hàng hóa", exact=True).check()
    pick(page, 0, "ABA2777-D-38")
    value_input(page, 0).fill("10")
    page.get_by_role("button", name="Lưu", exact=True).first.click()
    confirm = page.get_by_role("button", name="Vẫn lưu")
    try:
        confirm.wait_for(timeout=5000)
        confirm.click()
    except Exception:
        page.screenshot(path=str(OUT / "probe-save-no-confirm.png"))
    page.wait_for_timeout(2000)
    lines = captured.get("body", {}).get("groups", [{}])[0].get("lines", [])
    reward = [(l.get("role"), l.get("targetType"), l.get("discountValue")) for l in lines]
    print("reward lines:", reward)
    ok = reward == [("REWARD", "ITEM", 10)]
    print("PASS AC-01 payload targetType ITEM" if ok else "FAIL AC-01")
    page.screenshot(path=str(OUT / "AC-01-save-intercepted.png"))



def read_xlsx(path):
    """Minimal stdlib .xlsx reader (first sheet; numbers, shared/inline strings)."""
    import re
    import zipfile
    import xml.etree.ElementTree as ET

    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", ns):
                shared.append("".join(t.text or "" for t in si.iter(f"{{{ns['m']}}}t")))
        sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    rows = []
    for r in sheet.iter(f"{{{ns['m']}}}row"):
        cells = {}
        for c in r.findall("m:c", ns):
            col = re.match(r"[A-Z]+", c.get("r")).group(0)
            idx = 0
            for ch in col:
                idx = idx * 26 + ord(ch) - 64
            t, v = c.get("t"), c.find("m:v", ns)
            if t == "s":
                val = shared[int(v.text)]
            elif t == "inlineStr":
                val = "".join(x.text or "" for x in c.iter(f"{{{ns['m']}}}t"))
            elif v is None:
                val = None
            else:
                num = float(v.text)
                val = int(num) if num.is_integer() else num
            cells[idx - 1] = val
        width = max(cells) + 1 if cells else 0
        rows.append([cells.get(i) for i in range(width)])
    return rows


def check_export(page):
    results = []

    def expect(label, got, want):
        ok = got == want
        results.append(ok)
        print(f"{'PASS' if ok else 'FAIL'} {label}: got={got!r} want={want!r}")

    export_btn = page.get_by_role("button", name="Xuất khẩu")
    # AC-13 — hidden for Nhóm hàng hóa (the default scope) and for Đồng giá
    expect("AC-13 hidden in Nhóm hàng hóa", export_btn.count(), 0)
    page.get_by_label("Hàng hóa", exact=True).check()
    expect("visible in Hàng hóa + %", export_btn.count(), 1)
    page.get_by_label("Đồng giá").check()
    expect("AC-13 hidden in Đồng giá", export_btn.count(), 0)
    page.get_by_label("Giảm giá theo %").check()

    # AC-11 — empty grid gives a template
    with page.expect_download() as dl:
        export_btn.click()
    path = OUT / "AC-11-template.xlsx"
    dl.value.save_as(path)
    expect("AC-11 filename", dl.value.suggested_filename, "GiamGiaHangHoa.xlsx")
    expect("AC-11 header only", read_xlsx(path),
           [["Mã SKU*", "Tên hàng hóa", "Đơn vị tính", "Giá bán", "% giảm giá", "Giá khuyến mại"]])

    # AC-09 — current grid rows, in grid order
    pick(page, 0, "ABA2777-D-39")
    pick(page, 1, "ABA2777-D-38")
    value_input(page, 0).fill("30")
    value_input(page, 1).fill("10")
    page.screenshot(path=str(OUT / "AC-09-grid.png"))
    with page.expect_download() as dl:
        export_btn.click()
    path = OUT / "AC-09-export.xlsx"
    dl.value.save_as(path)
    data = read_xlsx(path)
    print("rows:", data)
    expect("AC-09 codes in grid order", [r[0] for r in data[1:]], ["ABA2777-D-39", "ABA2777-D-38"])
    expect("AC-09 values", [r[4] for r in data[1:]], [30, 10])
    promo_ok = all(r[3] is not None and r[5] == round(r[3] * (1 - r[4] / 100)) for r in data[1:])
    expect("AC-09 promo price = price × (1 − %)", promo_ok, True)

    print("ALL PASS" if all(results) else "SOME FAILED")


def check_import(page):
    results = []

    def expect(label, got, want):
        ok = got == want
        results.append(ok)
        print(f"{'PASS' if ok else 'FAIL'} {label}: got={got!r} want={want!r}")

    saves = []
    page.on("request", lambda r: saves.append(r.url) if r.method in ("POST", "PUT")
            and "/v2/promotions" in r.url and "item-discount-lines" not in r.url else None)

    page.get_by_label("Hàng hóa", exact=True).check()
    pick(page, 0, "ABA2777-D-38")
    pick(page, 1, "ABA2777-D-41")
    value_input(page, 0).fill("30")
    value_input(page, 1).fill("15")

    page.get_by_role("button", name="Nhập khẩu").click()
    with page.expect_file_chooser() as fc:
        page.get_by_role("button", name="Chọn tệp nguồn").click()
    fc.value.set_files(str(OUT / "AC-21-import.xlsx"))
    page.get_by_text("dòng hợp lệ").wait_for(timeout=15000)
    errors = page.get_by_role("table", name="Dòng lỗi").locator("tbody tr")
    got = [[c.inner_text().strip() for c in errors.nth(i).locator("td").all()] for i in range(errors.count())]
    expect("AC-22 error rows listed before apply", got, [
        ["4", "KHONG-CO-MA", "Không tìm thấy hàng hóa có mã 'KHONG-CO-MA'"],
        ["5", "ABA2777-D-39", "% giảm giá phải lớn hơn 0 và không quá 100"],
    ])
    page.screenshot(path=str(OUT / "AC-22-dialog.png"))
    page.get_by_role("button", name="Áp dụng", exact=True).click()
    page.wait_for_timeout(500)

    n = page.locator("tbody tr[data-row-index]").count()
    codes = [row(page, i).locator("td").first.locator("input").first.input_value() for i in range(n)]
    expect("AC-21 codes (kept, overwritten, added, blank last)", codes,
           ["ABA2777-D-38", "ABA2777-D-41", "ABA2777-D-40", ""])
    expect("AC-21 values", values(page, n), ["50", "15", "10", ""])
    page.screenshot(path=str(OUT / "AC-21-grid-after-import.png"))
    expect("AC-22 no save request fired", saves, [])

    print("ALL PASS" if all(results) else "SOME FAILED")


def capture_save(page):
    import json

    captured = {}

    def handle(route, request):
        if request.method == "POST" and request.url.rstrip("/").endswith("/v2/promotions"):
            captured["body"] = json.loads(request.post_data or "{}")
            route.abort()
        else:
            route.continue_()

    page.route("**/v2/promotions*", handle)
    return captured


def save_and_read(page, captured):
    page.get_by_role("button", name="Lưu", exact=True).first.click()
    confirm = page.get_by_role("button", name="Vẫn lưu")
    try:
        confirm.wait_for(timeout=5000)
        confirm.click()
    except Exception:
        page.screenshot(path=str(OUT / "probe-save-no-confirm.png"))
    page.wait_for_timeout(2000)
    lines = captured.get("body", {}).get("groups", [{}])[0].get("lines", [])
    return [l for l in lines if l.get("role") == "REWARD"]


def check_picker_and_group_payload(page):
    """AC-02 (picker keeps PRODUCT/ITEM) + group scope still sends CATEGORY."""
    captured = capture_save(page)
    page.get_by_placeholder("Nhập tên chương trình").fill("VERIFY picker")
    page.get_by_label("Hàng hóa", exact=True).check()
    row(page, 0).locator("td").first.locator("button").last.click()
    dlg = page.get_by_role("dialog")
    dlg.get_by_text("Chọn hàng hóa").wait_for()
    # whole product → PRODUCT
    dlg.locator("tr", has_text="AAA-AIDLC-MULTI").locator("input[type=checkbox]").first.check()
    # one variant of ABA2777 → ITEM
    prod = dlg.locator("tr", has_text="ABA2777").first
    prod.locator("button").first.click()
    page.wait_for_timeout(1000)
    dlg.locator("tr", has_text="ABA2777-D-38").locator("input[type=checkbox]").first.check()
    page.screenshot(path=str(OUT / "AC-02-picker.png"))
    dlg.get_by_role("button", name="Chọn", exact=True).click()
    page.wait_for_timeout(500)
    n = page.locator("tbody tr[data-row-index]").count()
    for i in range(n - 1):
        value_input(page, i).fill("5")
    reward = save_and_read(page, captured)
    got = sorted((l["targetType"]) for l in reward)
    print("picker reward:", [(l["targetType"], l["targetId"][:8]) for l in reward])
    ok1 = got == ["ITEM", "PRODUCT"]
    print(("PASS" if ok1 else "FAIL") + f" AC-02 picker keeps PRODUCT/ITEM: {got}")

    # group scope → CATEGORY, on a fresh form (switching scope keeps old rows —
    # pre-existing behaviour, reported separately)
    open_form(page)
    page.get_by_placeholder("Nhập tên chương trình").fill("VERIFY group")
    page.get_by_label("Nhóm hàng hóa", exact=True).check()
    page.wait_for_timeout(300)
    page.screenshot(path=str(OUT / "probe-group-switch.png"))
    last = page.locator("tbody tr[data-row-index]").count() - 1
    cell = row(page, last).locator("td").first.locator("input").first
    cell.click()
    cell.fill("")
    cell.press("ArrowDown")
    page.locator('[role="option"]').first.click()
    page.wait_for_timeout(300)
    for i in range(page.locator("tbody tr[data-row-index]").count() - 1):
        value_input(page, i).fill("5")
    captured.clear()
    reward = save_and_read(page, captured)
    got = [l["targetType"] for l in reward]
    ok2 = got == ["CATEGORY"]
    print(("PASS" if ok2 else "FAIL") + f" group scope sends CATEGORY: {got}")
    print("ALL PASS" if ok1 and ok2 else "SOME FAILED")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "probe")
