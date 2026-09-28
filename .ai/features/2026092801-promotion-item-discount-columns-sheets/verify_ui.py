"""Headless UI check for 2026092801 on the erp2 backoffice (:3010 → API :4199, erp_dev_3008).

Credentials come from .ai/credentials.env (LOCAL_BACKOFFICE_*); nothing is printed.
Usage: ~/.venvs/aidlc-verify/bin/python verify_ui.py <probe|grid|picker|reopen|excel>
Screenshots and downloads land in evidence/ next to this file.
"""
import json
import os
import re
import sys
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
OUT = HERE / "evidence"
OUT.mkdir(exist_ok=True)
BASE = os.environ.get("VERIFY_BASE", "http://localhost:3010")
API = os.environ.get("VERIFY_API", "http://localhost:4199")

RESULTS = []


def expect(label, got, want):
    ok = got == want
    RESULTS.append(ok)
    print(f"{'PASS' if ok else 'FAIL'} {label}: got={got!r} want={want!r}")


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
    page.fill('input[type="password"]', env["LOCAL_BACKOFFICE_PASSWORD"])
    page.click('button[type="submit"]')
    page.wait_for_url(lambda u: "/login" not in u, timeout=30000)
    page.wait_for_selector("text=Đang khôi phục phiên", state="detached", timeout=30000)


def open_form(page, kind="PRODUCT_DISCOUNT"):
    page.goto(f"{BASE}/promotions/programs/new?type={kind}")
    page.wait_for_selector("text=Khuyến mại", timeout=30000)
    page.wait_for_timeout(500)


# ---- grid helpers (Giảm giá hàng hóa) -------------------------------------------------

def grid(page):
    return page.locator("text=Thiết lập").locator("xpath=ancestor::div[contains(@class,'rounded')][1]")


def headers(page):
    ths = grid(page).locator("thead tr").first.locator("th")
    return [t.inner_text().strip() for t in ths.all()]


def row(page, i):
    return grid(page).locator(f'tbody tr[data-row-index="{i}"]')


def n_rows(page):
    return grid(page).locator("tbody tr[data-row-index]").count()


def col(page, label):
    return headers(page).index(label)


def cell_text(page, i, label):
    td = row(page, i).locator("td").nth(col(page, label))
    inp = td.locator("input")
    if inp.count():
        return inp.first.input_value().strip()
    return td.inner_text().strip()


def value_input(page, i):
    for label in ("% giảm giá", "Số tiền giảm"):
        if label in headers(page):
            return row(page, i).locator("td").nth(col(page, label)).locator("input").first
    raise AssertionError("no value column")


def pick(page, i, code):
    cell = row(page, i).locator("td").first.locator("input").first
    cell.click()
    cell.fill(code)
    try:
        page.locator('[role="option"]', has_text=code).first.click(timeout=10000)
    except Exception:
        page.screenshot(path=str(OUT / f"fail-pick-{code}.png"))
        raise
    page.wait_for_timeout(300)


def codes(page):
    return [cell_text(page, i, "Mã hàng") for i in range(n_rows(page))]


def snapshot_rows(page, labels):
    return [[cell_text(page, i, l) for l in labels] for i in range(n_rows(page))]


def digits(s):
    return re.sub(r"\D", "", s)


# ---- xlsx (stdlib reader, every sheet) --------------------------------------------------

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}


def read_xlsx(path):
    """{sheet name: rows} in workbook order."""
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", NS):
                shared.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))
        rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
        book = ET.fromstring(z.read("xl/workbook.xml"))
        out = {}
        for s in book.find("m:sheets", NS):
            target = rels[s.get(f"{{{NS['r']}}}id")].lstrip("/")
            target = target if target.startswith("xl/") else f"xl/{target}"
            out[s.get("name")] = _rows(ET.fromstring(z.read(target)), shared)
        return out


def _rows(sheet, shared):
    rows = []
    for r in sheet.iter(f"{{{NS['m']}}}row"):
        cells = {}
        for c in r.findall("m:c", NS):
            letters = re.match(r"[A-Z]+", c.get("r")).group(0)
            idx = 0
            for ch in letters:
                idx = idx * 26 + ord(ch) - 64
            t, v = c.get("t"), c.find("m:v", NS)
            if t == "s":
                val = shared[int(v.text)]
            elif t == "inlineStr":
                val = "".join(x.text or "" for x in c.iter(f"{{{NS['m']}}}t"))
            elif v is None:
                val = None
            else:
                num = float(v.text)
                val = int(num) if num.is_integer() else num
            cells[idx - 1] = val
        if cells:
            rows.append([cells.get(i) for i in range(max(cells) + 1)])
    return rows


SHEETS = ["Giảm giá theo %", "Giảm giá theo số tiền", "Đồng giá"]


# ---- steps ------------------------------------------------------------------------------

def step_probe_picker(page):
    page.get_by_label("Hàng hóa", exact=True).check()
    dlg = open_picker(page)
    page.wait_for_timeout(1500)
    print([t.inner_text().replace("\n", " | ")[:120] for t in dlg.locator("tr").all()][:20])
    page.screenshot(path=str(OUT / "probe-picker.png"))


def step_probe(page):
    page.get_by_label("Hàng hóa", exact=True).check()
    pick(page, 0, "GELLI-39-DEN")
    print("headers:", headers(page))
    print("row0:", [c.inner_text() for c in row(page, 0).locator("td").all()])
    page.screenshot(path=str(OUT / "probe.png"), full_page=True)


def step_grid(page):
    """AC-03, AC-04, AC-05, AC-08, AC-09, AC-10."""
    page.get_by_label("Hàng hóa", exact=True).check()
    pick(page, 0, "GELLI-39-DEN")
    expect("AC-03 headers (Hàng hóa, %)", [h for h in headers(page) if h][:6],
           ["Mã hàng", "Tên hàng hóa", "ĐVT", "Giá bán", "% giảm giá", "Giá khuyến mại"])
    value_input(page, 0).fill("30")
    page.wait_for_timeout(200)
    expect("AC-04 ĐVT", cell_text(page, 0, "ĐVT"), "đôi")
    expect("AC-04 Giá bán", digits(cell_text(page, 0, "Giá bán")), "590000")
    expect("AC-04 Giá KM at 30%", digits(cell_text(page, 0, "Giá khuyến mại")), "413000")
    page.screenshot(path=str(OUT / "AC-04-percent-30.png"))
    value_input(page, 0).fill("10")
    page.wait_for_timeout(200)
    expect("AC-04 Giá KM live at 10%", digits(cell_text(page, 0, "Giá khuyến mại")), "531000")
    expect("AC-06 blank trailing row has no price", cell_text(page, 1, "Giá khuyến mại"), "")

    page.get_by_label("Giảm giá theo số tiền").check()
    value_input(page, 0).fill("800000")
    page.wait_for_timeout(200)
    expect("AC-05 headers (Số tiền)", "Số tiền giảm" in headers(page), True)
    expect("AC-05 Giá KM floors at 0", digits(cell_text(page, 0, "Giá khuyến mại")), "0")
    page.screenshot(path=str(OUT / "AC-05-amount-over-price.png"))

    page.get_by_label("Đồng giá").check()
    fixed = grid(page).locator("input:not([type=radio])").first  # the Đồng giá money input in the Thiết lập row
    fixed.fill("50000")
    page.wait_for_timeout(200)
    h = [x for x in headers(page) if x]
    expect("AC-09 no value column in Đồng giá (Hàng hóa)",
           ("% giảm giá" in h, "Số tiền giảm" in h), (False, False))
    expect("AC-09 no copy-down in Đồng giá",
           page.get_by_label("Sao chép giá trị xuống các dòng dưới").count(), 0)
    expect("AC-10 Giá KM = Đồng giá", digits(cell_text(page, 0, "Giá khuyến mại")), "50000")
    page.screenshot(path=str(OUT / "AC-09-AC-10-dong-gia.png"))
    fixed.fill("60000")
    page.wait_for_timeout(200)
    expect("AC-10 Giá KM follows Đồng giá", digits(cell_text(page, 0, "Giá khuyến mại")), "60000")

    page.get_by_label("Nhóm hàng hóa", exact=True).check()
    page.wait_for_timeout(300)
    h = [x for x in headers(page) if x]
    expect("AC-09 no value column in Đồng giá (Nhóm)", "% giảm giá" in h or "Số tiền giảm" in h, False)
    expect("AC-08 no ĐVT/Giá bán/Giá KM for Nhóm",
           [x for x in ("ĐVT", "Giá bán", "Giá khuyến mại") if x in h], [])
    page.screenshot(path=str(OUT / "AC-08-AC-09-nhom-dong-gia.png"))
    page.get_by_label("Giảm giá theo %").check()
    page.wait_for_timeout(200)
    h = [x for x in headers(page) if x]
    expect("AC-08 Nhóm + %: value column back, still no price columns",
           ("% giảm giá" in h, [x for x in ("ĐVT", "Giá bán", "Giá khuyến mại") if x in h]), (True, []))
    page.screenshot(path=str(OUT / "AC-08-nhom-percent.png"))


def open_picker(page):
    row(page, n_rows(page) - 1).locator("td").first.locator("button").last.click()
    dlg = page.get_by_role("dialog")
    dlg.get_by_text("Chọn hàng hóa").first.wait_for()
    return dlg


def pick_in_dialog(page, dlg, whole=None, variant=None):
    if whole:
        dlg.locator("tr", has_text=whole).locator("input[type=checkbox]").first.check()
    if variant:
        parent = "Giày Gelli"
        dlg.locator("tr", has_text=parent).first.locator("button").first.click()
        page.wait_for_timeout(1000)
        vrow = dlg.locator("tr", has_text=variant).first
        print("picker variant row:", vrow.inner_text().replace("\n", " | "))
        page.screenshot(path=str(OUT / "AC-02-picker-variant-row.png"))
        vrow.locator("input[type=checkbox]").first.check()
    dlg.get_by_role("button", name="Chọn", exact=True).click()
    page.wait_for_timeout(500)


def step_picker(page):
    """AC-02 (this grid + Tặng hàng), AC-06 (picker), AC-07 (PRODUCT row)."""
    page.get_by_label("Hàng hóa", exact=True).check()
    dlg = open_picker(page)
    pick_in_dialog(page, dlg, variant="GELLI-40-NAU")
    dlg = open_picker(page)
    pick_in_dialog(page, dlg, whole="Giày Gelli")
    rows = snapshot_rows(page, ["Mã hàng", "Tên hàng hóa", "ĐVT", "Giá bán", "Giá khuyến mại"])
    print("rows:", rows)
    by_code = {r[0]: r for r in rows}
    v = by_code.get("GELLI-40-NAU")
    p = next((r for r in rows if r[0] != "GELLI-40-NAU" and r[0] and not r[0].startswith("GELLI-")), None)
    expect("AC-02 variant name equals stored item name (nothing appended)", v and v[1], "Giày Gelli (40 · Nâu)")
    expect("AC-06 picker variant has ĐVT/Giá bán", v and (v[2], digits(v[3])), ("đôi", "590000"))
    expect("AC-07 PRODUCT row ĐVT/Giá bán/Giá KM blank", p and (p[2], p[3], p[4]), ("", "", ""))
    page.screenshot(path=str(OUT / "AC-02-AC-06-AC-07-picker.png"))


def step_reopen(page, env):
    """AC-06 (reopened program): save for real, reopen, check ĐVT/Giá bán; then soft-delete."""
    page.get_by_placeholder("Nhập tên chương trình").fill("VERIFY 2026092801 reopen")
    page.get_by_label("Hàng hóa", exact=True).check()
    pick(page, 0, "GELLI-39-DEN")
    value_input(page, 0).fill("10")
    with page.expect_response(lambda r: r.request.method == "POST"
                              and r.url.rstrip("/").endswith("/v2/promotions")) as resp:
        page.get_by_role("button", name="Lưu", exact=True).first.click()
        confirm = page.get_by_role("button", name="Vẫn lưu")
        try:
            confirm.wait_for(timeout=4000)
            confirm.click()
        except Exception:
            pass
    body = resp.value.json()
    pid = body.get("id") or body.get("data", {}).get("id")
    expect("save 201", resp.value.status, 201)
    try:
        page.goto(f"{BASE}/promotions/programs/{pid}/edit")
        page.wait_for_selector("text=Thiết lập", timeout=30000)
        page.wait_for_timeout(1000)
        r0 = snapshot_rows(page, ["Mã hàng", "Tên hàng hóa", "ĐVT", "Giá bán", "Giá khuyến mại"])[0]
        print("reopened row:", r0)
        expect("AC-06 reopened: ĐVT / Giá bán / Giá KM",
               (r0[0], r0[2], digits(r0[3]), digits(r0[4])), ("GELLI-39-DEN", "đôi", "590000", "531000"))
        page.screenshot(path=str(OUT / "AC-06-reopened.png"))
    finally:
        token = page.evaluate("() => null")  # access token lives in memory; delete through a fresh API login
        req = urllib.request.Request(f"{API}/auth/login", data=json.dumps({
            "email": env["LOCAL_BACKOFFICE_EMAIL"], "password": env["LOCAL_BACKOFFICE_PASSWORD"],
            "organizationId": env["LOCAL_BACKOFFICE_ORG_ID"]}).encode(),
            headers={"Content-Type": "application/json"})
        token = json.loads(urllib.request.urlopen(req).read())
        token = token.get("accessToken") or token.get("data", {}).get("accessToken")
        d = urllib.request.Request(f"{API}/v2/promotions/{pid}", method="DELETE",
                                   headers={"Authorization": f"Bearer {token}"})
        print("cleanup DELETE:", urllib.request.urlopen(d).status, "id", pid[:8])


def step_excel(page):
    """AC-11, AC-14, AC-16, AC-06 (import)."""
    imp = page.get_by_role("button", name="Nhập khẩu")
    exp = page.get_by_role("button", name="Xuất khẩu")
    page.get_by_label("Nhóm hàng hóa", exact=True).check()
    page.get_by_label("Đồng giá").check()
    expect("AC-11 hidden for Nhóm + Đồng giá", (imp.count(), exp.count()), (0, 0))
    page.get_by_label("Hàng hóa", exact=True).check()
    page.wait_for_timeout(300)
    expect("AC-11 visible for Hàng hóa + Đồng giá", (imp.count(), exp.count()), (1, 1))
    grid(page).locator("input:not([type=radio])").first.fill("50000")
    pick(page, 0, "GELLI-39-DEN")
    page.screenshot(path=str(OUT / "AC-11-dong-gia-buttons.png"))

    # AC-14 — template from the dialog
    imp.click()
    dlg = page.get_by_role("dialog")
    with page.expect_download() as dl:
        dlg.get_by_role("button", name="Tải file mẫu").click()
    path = OUT / "AC-14-template.xlsx"
    dl.value.save_as(path)
    page.screenshot(path=str(OUT / "AC-14-dialog-template-link.png"))
    wb = read_xlsx(path)
    expect("AC-14 template sheets", list(wb), SHEETS)
    expect("AC-14 template header-only",
           {k: v for k, v in wb.items()},
           {"Giảm giá theo %": [["Mã SKU*", "Tên hàng hóa", "% giảm giá"]],
            "Giảm giá theo số tiền": [["Mã SKU*", "Tên hàng hóa", "Số tiền giảm"]],
            "Đồng giá": [["Mã SKU*", "Tên hàng hóa"]]})

    # AC-16 — Đồng giá import: existing kept, new added with ĐVT/giá, unknown reported
    with page.expect_file_chooser() as fc:
        dlg.get_by_role("button", name="Chọn tệp nguồn").click()
    fc.value.set_files(str(OUT / "AC-16-import-dong-gia.xlsx"))
    dlg.get_by_text("dòng hợp lệ").wait_for(timeout=15000)
    errs = dlg.get_by_role("table", name="Dòng lỗi").locator("tbody tr")
    got = [[c.inner_text().strip() for c in errs.nth(i).locator("td").all()] for i in range(errs.count())]
    expect("AC-16 error rows", got, [["4", "KHONG-CO-MA", "Không tìm thấy hàng hóa có mã 'KHONG-CO-MA'"]])
    expect("AC-16 Đồng giá summary wording", dlg.get_by_text("mã đã có được giữ nguyên").count(), 1)
    page.screenshot(path=str(OUT / "AC-16-dialog.png"))
    dlg.get_by_role("button", name="Áp dụng", exact=True).click()
    page.wait_for_timeout(500)
    rows = snapshot_rows(page, ["Mã hàng", "ĐVT", "Giá bán", "Giá khuyến mại"])
    print("rows after Đồng giá import:", rows)
    expect("AC-16 codes (existing kept, new added, blank last)",
           [r[0] for r in rows], ["GELLI-39-DEN", "GELLI-40-DEN", ""])
    expect("AC-16/AC-06 new row has ĐVT/Giá bán, Giá KM = Đồng giá",
           (rows[1][1], digits(rows[1][2]), digits(rows[1][3])), ("đôi", "590000", "50000"))
    page.screenshot(path=str(OUT / "AC-16-grid-after-import.png"))

    # export in Đồng giá → data in the Đồng giá sheet
    with page.expect_download() as dl:
        exp.click()
    path = OUT / "AC-13-export-dong-gia.xlsx"
    dl.value.save_as(path)
    wb = read_xlsx(path)
    expect("export Đồng giá: codes in Đồng giá sheet",
           [r[0] for r in wb["Đồng giá"][1:]], ["GELLI-39-DEN", "GELLI-40-DEN"])
    expect("export Đồng giá: other sheets header-only",
           (len(wb["Giảm giá theo %"]), len(wb["Giảm giá theo số tiền"])), (1, 1))

    # AC-06 — % import: new row carries ĐVT / Giá bán, Giá KM computed
    page.get_by_label("Giảm giá theo %").check()
    imp.click()
    dlg = page.get_by_role("dialog")
    expect("% summary wording", dlg.get_by_text("mã đã có thì cập nhật giá trị").count(), 0)  # shown only after a file
    with page.expect_file_chooser() as fc:
        dlg.get_by_role("button", name="Chọn tệp nguồn").click()
    fc.value.set_files(str(OUT / "AC-06-import-percent.xlsx"))
    dlg.get_by_text("dòng hợp lệ").wait_for(timeout=15000)
    expect("% summary wording after file", dlg.get_by_text("mã đã có thì cập nhật giá trị").count(), 1)
    dlg.get_by_role("button", name="Áp dụng", exact=True).click()
    page.wait_for_timeout(500)
    rows = snapshot_rows(page, ["Mã hàng", "ĐVT", "Giá bán", "% giảm giá", "Giá khuyến mại"])
    print("rows after % import:", rows)
    r = next((x for x in rows if x[0] == "GELLI-43-DEN"), None)
    expect("AC-06 imported row: ĐVT / Giá bán / % / Giá KM",
           r and (r[1], digits(r[2]), r[3], digits(r[4])), ("đôi", "590000", "20", "472000"))
    page.screenshot(path=str(OUT / "AC-06-grid-after-import.png"))


def main(step: str):
    env = creds()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900}, accept_downloads=True)
        login(page, env)
        open_form(page)
        {"probe": step_probe, "probe-picker": step_probe_picker, "grid": step_grid, "picker": step_picker,
         "excel": step_excel}.get(step, lambda pg: step_reopen(pg, env))(page)
        browser.close()
    print("ALL PASS" if RESULTS and all(RESULTS) else "SOME FAILED")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "probe")
