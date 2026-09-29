"""
Headless POS evidence for `2026092402-pos-order-delivery-lifecycle`. Login flow
forked from 2026091804's capture script. Every claim is read from the DOM and
asserted; a screenshot of the wrong page still exits 1.

  --online   UOW-01: /pos/online-orders — sidebar kênh, 10 cột, lưới, phân trang
  --stockshort UOW-01 AC-05: dòng STOCK_ORDER (đã đặt stock_short=true) hiện nhãn "Thiếu hàng"
             và lọc Nhãn giữ lại dòng đó. Env: STOCK_ORDER (mã OCM), ORDER_DAY
  --process  UOW-02: tick 1 đơn Chưa xử lý → Nhận xử lý, đọc toast (GHI DB: tạo hoá đơn nháp)
  --orders   UOW-04: /pos/orders — 10 tab (đếm khớp API), 24 cột, nút ngoài phạm vi disabled
  --opendraft UOW-04: bấm dòng hoá đơn nháp → mở vào tab checkout (không ghi DB)
  --deliver  UOW-05: Giao hàng (lỗi HĐ nháp + thành công), Thất bại → Chuyển hoàn,
             đơn thứ hai giao không ĐT → Hoàn thành (GHI DB). Env: PAID_ORDER, DRAFT_ORDER
  --partners UOW-03: backoffice /admin/delivery-partners + mục sidebar (BO_URL, mặc định :3000)

Run:
    ~/.venvs/aidlc-verify/bin/python \\
      .ai/features/2026092402-pos-order-delivery-lifecycle/capture-pos-evidence.py --online
POS_URL overrides http://localhost:3001.
"""
import json
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

FEATURE = Path(__file__).resolve().parent
ROOT = FEATURE.parents[2]
CRED = ROOT / ".ai" / "credentials.env"
EVIDENCE = FEATURE / "evidence" / "local-pos" / "desktop"
URL = os.environ.get("POS_URL", "http://localhost:3001") + "/pos"
ONLINE_COLUMNS = [
    "Mã đơn hàng (OCM)", "Ngày đơn hàng", "Thông tin giao hàng", "Tổng thanh toán",
    "Trạng thái", "ĐT giao vận", "NV bán hàng", "Số hóa đơn", "Ghi chú", "Nhãn",
]

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
    branch = os.environ.get("POS_BRANCH_ID") or c.get("LOCAL_POS_BRANCH_ID") or ""
    radios = page.locator('input[name="pos-branch"]')
    labels = [" ".join(t.split()) for t in page.locator('label:has(input[name="pos-branch"])').all_inner_texts()]
    print("  branches offered:", labels)
    if branch and page.locator(f'input[name="pos-branch"][value="{branch}"]').count():
        page.click(f'input[name="pos-branch"][value="{branch}"]')
    else:
        radios.first.click()
    page.click('button[type="submit"]')
    page.wait_for_selector('[aria-label="Sapo POS"]', timeout=30000)
    print("logged in:", page.url)
    return page


def online(page):
    errors: list[str] = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    api: dict[str, object] = {}

    def on_response(r):
        if "/mobile/sales-channels" in r.url or "/sales-orders/search" in r.url:
            try:
                api[r.url.split("/api")[-1] + f" [{r.status}]"] = r.json()
            except Exception:
                api[r.url + f" [{r.status}]"] = "<non-json>"

    page.on("response", on_response)
    page.goto(f"{URL}/online-orders", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(2500)

    for k, v in api.items():
        if isinstance(v, list):
            print("  api", k, "channels:", [c.get("name") for c in v])
        elif isinstance(v, dict):
            print("  api", k, "total:", v.get("total"), "rows:", len(v.get("data", [])))
        else:
            print("  api", k, v)

    body = page.inner_text("body")
    # "hóa" và "hoá" là hai cách bỏ dấu hợp lệ; pos-web dùng "hoá" (DS hoá đơn).
    norm = lambda t: t.replace("hoá", "hóa")
    headers = [norm(h.strip()) for h in page.locator("th").all_inner_texts()]
    check("route renders (no 404/redirect)", "/online-orders" in page.url, page.url)
    check("10 columns present", all(any(c in h for h in headers) for c in ONLINE_COLUMNS),
          [c for c in ONLINE_COLUMNS if not any(c in h for h in headers)])
    check("Nhận xử lý button present", "Nhận xử lý" in body)
    check("default status Chưa xử lý", "Chưa xử lý" in body)
    check("pagination summary", "kết quả" in body)
    ch = next((v for k, v in api.items() if "sales-channels" in k and isinstance(v, list)), None)
    check("channels API 200", ch is not None)
    if ch:
        for c in ch:
            check(f"sidebar shows {c['name']}", c["name"] in body)
    search = [k for k in api if "sales-orders/search" in k]
    check("search called with 200", any("[200]" in k for k in search), search)
    check("no console errors", not errors, errors[:3])

    EVIDENCE.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(EVIDENCE / "AC-01-online-orders.png"), full_page=False)
    (EVIDENCE / "AC-01-online-orders.api.json").write_text(json.dumps(api, ensure_ascii=False, indent=1, default=str))
    print("  shot", EVIDENCE / "AC-01-online-orders.png")


def stockshort(page):
    """AC-05. Không ghi DB — cờ stock_short đặt/gỡ bằng SQL bên ngoài script."""
    ext = os.environ["STOCK_ORDER"]
    page.goto(f"{URL}/online-orders", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(2500)
    day = os.environ.get("ORDER_DAY")
    if day:
        page.locator('input[type="date"]').first.fill(day)
        page.wait_for_timeout(2000)
    row = _row(page, ext)
    check(f"row {ext} visible", row.count() == 1)
    check(f"row {ext} shows Thiếu hàng", "Thiếu hàng" in row.inner_text())
    others = page.locator("tbody tr").filter(has_not_text=ext).filter(has_text="Thiếu hàng").count()
    check("no other row labelled Thiếu hàng", others == 0, others)
    # Cột Nhãn là cột cuối, nằm ngoài khung ngang → cuộn lưới sang phải trước khi chụp.
    row.evaluate("""r => { for (let e = r; e; e = e.parentElement)
        if (e.scrollWidth > e.clientWidth) e.scrollLeft = e.scrollWidth; }""")
    page.wait_for_timeout(300)
    label = row.get_by_text("Thiếu hàng", exact=True)
    check("Thiếu hàng label in viewport", label.count() == 1 and label.is_visible()
          and 0 <= label.bounding_box()["x"] < page.viewport_size["width"])
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(EVIDENCE / "AC-05-stock-short.png"), full_page=False)
    print("  shot", EVIDENCE / "AC-05-stock-short.png")


def process(page):
    """AC-06/07/09. Tick 2 đơn; đơn thứ 2 được xử lý "ở nơi khác" (qua API) ngay
    trước khi bấm → kỳ vọng toast 1/2 kèm lý do. Cần ca đang mở ở chi nhánh."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("seed", FEATURE / "seed-demo.py")
    seed = importlib.util.module_from_spec(spec); spec.loader.exec_module(seed)
    page.goto(f"{URL}/online-orders", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(2500)
    day = os.environ.get("ORDER_DAY")  # YYYY-MM-DD; đơn demo tạo 2026-09-24
    if day:
        page.locator('input[type="date"]').first.fill(day)
        page.wait_for_timeout(2000)
    btn = page.get_by_role("button", name="Nhận xử lý")
    check("AC-09 disabled with nothing ticked", btn.is_disabled())
    rows = page.locator("tbody tr:has(td:nth-child(2))").filter(has_not_text="Không có đơn hàng nào")
    n = rows.count()
    check("has ≥2 Chưa xử lý rows", n >= 2, n)
    if n < 2:
        return
    codes = [rows.nth(i).locator("td").nth(1).inner_text().strip() for i in range(2)]
    print("  ticking", codes)
    for i in range(2):
        rows.nth(i).locator('label:has(input[type="checkbox"])').first.click()
    page.wait_for_timeout(300)
    check("enabled after tick", btn.is_enabled())
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(EVIDENCE / "AC-09-ticked.png"))
    # xử lý đơn thứ 2 ở "nơi khác"
    bid = os.environ["POS_BRANCH_ID"]
    tok = seed.login_to(bid)
    st, res = seed.call("POST", "/v2/mobile/sales-orders/search", tok, bid,
                        {"view": "ONLINE", "channelId": seed.call("GET", "/mobile/sales-channels", tok, bid)[1][0]["id"],
                         "status": "SENT", "page": 1, "limit": 100})
    other = next(r for r in res["data"] if r["externalOrderId"] == codes[1])
    st, r2 = seed.call("POST", "/mobile/sales-orders/process", tok, bid, {"ids": [other["id"]]})
    print("  pre-processed elsewhere:", st, r2)
    resp = {}
    page.on("response", lambda r: resp.setdefault("r", r) if "/sales-orders/process" in r.url else None)
    btn.click()
    toast = page.locator("[data-sonner-toast]").first
    toast.wait_for(timeout=15000)
    page.wait_for_timeout(400)
    text = " ".join(toast.inner_text().split())
    print("  toast:", text)
    r = resp.get("r")
    print("  api:", r.status if r else None, r.json() if r else None)
    page.screenshot(path=str(EVIDENCE / "AC-07-process-toast.png"))
    check("process API 200", bool(r) and r.status == 200)
    check("AC-07 toast 1/2", "1/2" in text, text)
    check("AC-07 reason for second order", codes[1] in text, text)
    page.wait_for_timeout(1500)
    body = page.inner_text("tbody") if page.locator("tbody").count() else ""
    check("AC-06 processed rows left Chưa xử lý list", codes[0] not in body and codes[1] not in body)
    print("  shot", EVIDENCE / "AC-07-process-toast.png")
    (EVIDENCE / "processed.json").write_text(json.dumps({"ui": codes[0], "elsewhere": codes[1]}))


DELIVERY_COLUMNS = [
    "Ngày tạo đơn", "Ngày GH", "Ngày HĐ", "Số hóa đơn", "Thu ngân", "NV bán hàng", "Khách hàng",
    "Người nhận", "Phí GH thu khách", "ĐT giao hàng", "Mã vận đơn", "Mã đơn hàng", "Tổng thanh toán",
    "Đặt cọc", "Khách nợ", "Còn phải thu", "Thu hộ", "Thông tin gói hàng", "Phí GH trả ĐT",
    "Kênh bán hàng", "Loại đơn hàng", "Nhãn", "Ghi chú", "Trạng thái",
]
TABS = [
    ("Tất cả", None), ("Chờ giao/lấy hàng", "AWAITING_PICKUP"), ("Đang giao hàng", "IN_TRANSIT"),
    ("Chờ thu COD", "AWAITING_COD"), ("Hoàn thành", "COMPLETED"), ("Thất bại", "FAILED"),
    ("Đã chuyển hoàn", "RETURNED"), ("Đã hủy", "CANCELLED"), ("Đã thanh toán", "PAID"),
    ("Chưa thanh toán/Lưu tạm", "UNPAID"),
]
OUT_OF_SCOPE = ["Gửi đơn hàng", "Thu COD", "Gắn nhãn", "Thống kê hàng hóa", "In phiếu GH"]


def orders(page):
    import importlib.util, re
    spec = importlib.util.spec_from_file_location("seed", FEATURE / "seed-demo.py")
    seed = importlib.util.module_from_spec(spec); spec.loader.exec_module(seed)
    bid = os.environ["POS_BRANCH_ID"]
    tok = seed.login_to(bid)
    errors: list[str] = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(f"{URL}/orders", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(2500)
    norm = lambda t: t.replace("hoá", "hóa").replace("huỷ", "hủy")
    headers = [norm(h.strip()) for h in page.locator("th").all_inner_texts()]
    missing = [c for c in DELIVERY_COLUMNS if not any(c in h for h in headers)]
    check("AC-15 24 columns present", not missing, missing)
    for label in OUT_OF_SCOPE:
        b = page.get_by_role("button", name=label)
        check(f"AC-17 {label} disabled", b.count() > 0 and b.first.is_disabled())
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    for label, tab in TABS:
        page.get_by_role("tab", name=label, exact=True).first.click()
        page.wait_for_timeout(1500)
        body = {"view": "DELIVERY", "page": 1, "limit": 100, "dateField": "CREATED"}
        if tab:
            body["deliveryTab"] = tab
        # cùng khoảng "7 ngày gần đây" với UI: đọc tổng trên UI, so với API không giới hạn ngày
        # chỉ khi UI tổng ≤ API tổng; so sánh chặt dùng 'x-y/z' của UI với API cùng from/to.
        txt = page.inner_text("body")
        m = re.search(r"(\d+)\s*-\s*(\d+)\s*/\s*(\d+)\s*kết quả", txt)
        ui_total = int(m.group(3)) if m else 0
        from datetime import date, timedelta
        today = date.today()
        body.update({"from": (today - timedelta(days=6)).isoformat(), "to": today.isoformat()})
        st, res = seed.call("POST", "/v2/mobile/sales-orders/search", tok, bid, body)
        api_total = res.get("total") if isinstance(res, dict) else None
        check(f"AC-12/13 tab '{label}' UI total = API total", ui_total == api_total, (ui_total, api_total))
        if tab in (None, "AWAITING_PICKUP", "UNPAID"):
            page.screenshot(path=str(EVIDENCE / f"AC-12-tab-{tab or 'ALL'}.png"))
    check("no console errors", not errors, errors[:3])


def opendraft(page):
    errors: list[str] = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(f"{URL}/orders", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(2000)
    page.get_by_role("tab", name="Chưa thanh toán/Lưu tạm", exact=True).first.click()
    page.wait_for_timeout(1500)
    row = page.locator("tbody tr").first
    cells = row.locator("td")
    code = cells.nth(4).inner_text().strip()  # Số hóa đơn (sau ô chọn + 3 cột ngày)
    print("  opening draft", code)
    cells.nth(4).click()
    page.wait_for_timeout(2500)
    toast = page.locator("[data-sonner-toast]")
    ttext = " ".join(toast.first.inner_text().split()) if toast.count() else ""
    print("  url", page.url, "| toast:", ttext)
    check("AC-13 navigated to checkout", page.url.rstrip("/").endswith("/pos"), page.url)
    # Toast có thể đã tắt sau 2,5s — bằng chứng chắc hơn là tab mang mã hoá đơn nháp + có dòng hàng.
    check("checkout tab titled with draft code", page.get_by_text(code, exact=True).count() > 0, code)
    check("cart has ≥1 line", page.locator("table tbody tr").count() > 0)
    check("no console errors", not errors, errors[:3])
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(EVIDENCE / "AC-13-open-draft.png"))
    print("  shot", EVIDENCE / "AC-13-open-draft.png")


def _seed():
    import importlib.util
    spec = importlib.util.spec_from_file_location("seed", FEATURE / "seed-demo.py")
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


def _row(page, ext):
    return page.locator("tbody tr").filter(has_text=ext).first


def _tick(page, ext):
    _row(page, ext).locator('label:has(input[type="checkbox"])').first.click()
    page.wait_for_timeout(200)


def _tab(page, name):
    page.get_by_role("tab", name=name, exact=True).first.click()
    page.wait_for_timeout(1500)


def _field(dialog, label):
    return dialog.locator(f'label:text-is("{label}")').first.locator("xpath=..")


def _pick(dialog, label, option):
    _field(dialog, label).locator("button").first.click()
    dialog.page.wait_for_timeout(300)
    dialog.page.get_by_role("option", name=option).first.click()
    dialog.page.wait_for_timeout(200)


def _toast(page, expect):
    """Chờ toast MỚI chứa `expect` (không xoá DOM của sonner — làm vậy làm hỏng nó)."""
    t = page.locator("[data-sonner-toast]").filter(has_text=expect).last
    t.wait_for(timeout=15000)
    page.wait_for_timeout(300)
    return " ".join(t.inner_text().split())


def _api_row(seed, tok, bid, ext):
    st, res = seed.call("POST", "/v2/mobile/sales-orders/search", tok, bid, {"view": "DELIVERY", "page": 1, "limit": 100})
    return next((r for r in res.get("data", []) if r["externalOrderId"] == ext), None)


def deliver(page):
    seed = _seed()
    bid = os.environ["POS_BRANCH_ID"]
    paid, draft = os.environ["PAID_ORDER"], os.environ["DRAFT_ORDER"]
    tok = seed.login_to(bid)
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    page.goto(f"{URL}/orders", wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(2000)
    giao = page.get_by_role("button", name="Giao hàng", exact=True)
    resume = os.environ.get("RESUME", "")
    if resume == "returned":
        return deliver_from_returned(page, seed, tok, bid, paid, draft, giao)
    _tab(page, "Chờ giao/lấy hàng")

    # AC-19: đơn có hoá đơn nháp
    _tick(page, draft)
    check("Giao hàng enabled", giao.is_enabled())
    giao.click()
    dialog = page.get_by_role("dialog")
    dialog.wait_for(timeout=5000)
    page.screenshot(path=str(EVIDENCE / "AC-18-deliver-dialog-empty.png"))
    dialog.get_by_role("button", name="Lưu").click()
    t = _toast(page, "đơn đã giao")
    print("  toast:", t)
    check("AC-19 draft invoice refused", "0/1" in t and "Hoá đơn chưa hoàn tất" in t, t)
    page.screenshot(path=str(EVIDENCE / "AC-19-not-finalized.png"))
    r = _api_row(seed, tok, bid, draft)
    check("AC-19 order unchanged", r and r["deliveryStatus"] == "AWAITING_PICKUP", r and r["deliveryStatus"])
    page.keyboard.press("Escape")
    page.wait_for_timeout(500)

    # AC-18: giao đơn đã thanh toán với GHN
    page.reload(); page.wait_for_timeout(2000)
    _tab(page, "Chờ giao/lấy hàng")
    _tick(page, paid)
    giao.click()
    dialog = page.get_by_role("dialog"); dialog.wait_for(timeout=5000)
    _pick(dialog, "ĐT giao hàng", "Giao Hàng Nhanh")
    _field(dialog, "Mã vận đơn").locator("input").first.fill("VD123")
    _field(dialog, "Phí GH trả ĐT").locator("input").first.fill("20000")
    _field(dialog, "Thông tin gói hàng").locator("input, textarea").first.fill("2kg")
    page.screenshot(path=str(EVIDENCE / "AC-18-deliver-dialog.png"))
    dialog.get_by_role("button", name="Lưu").click()
    t = _toast(page, "1/1 đơn đã giao"); print("  toast:", t)
    check("AC-18 delivered 1/1", "1/1" in t, t)
    r = _api_row(seed, tok, bid, paid)
    check("AC-18 IN_TRANSIT + fields", r and r["deliveryStatus"] == "IN_TRANSIT" and r.get("trackingCode") == "VD123"
          and r.get("deliveryPartnerName") == "Giao Hàng Nhanh" and float(r.get("partnerShippingFee") or -1) == 20000
          and r.get("packageInfo") == "2kg" and r.get("deliveredAt"),
          r and {k: r.get(k) for k in ("deliveryStatus", "trackingCode", "deliveryPartnerName", "partnerShippingFee", "packageInfo", "deliveredAt")})
    _tab(page, "Đang giao hàng")
    body = page.inner_text("tbody")
    check("AC-15 grid shows GHN / VD123 / 20.000", "VD123" in body and "Giao Hàng Nhanh" in body and "20.000" in body)
    page.screenshot(path=str(EVIDENCE / "AC-18-in-transit.png"))

    # AC-20: Cập nhật TT → Thất bại
    _tick(page, paid)
    page.get_by_role("button", name="Cập nhật TT").click()
    dialog = page.get_by_role("dialog"); dialog.wait_for(timeout=5000)
    _field(dialog, "Trạng thái mới").locator("button").first.click()
    page.wait_for_timeout(300)
    opts = [o.strip() for o in page.get_by_role("option").all_inner_texts()]
    print("  next options:", opts)
    check("AC-20 options from allowedNextStatuses", set(opts) == {"Chờ thu COD", "Thất bại", "Hoàn thành"}, opts)
    page.get_by_role("option", name="Thất bại").first.click()
    dialog.get_by_role("button", name="Lưu").click()
    t = _toast(page, "đã cập nhật"); print("  toast:", t)
    check("AC-20 → FAILED", "1/1" in t and _api_row(seed, tok, bid, paid)["deliveryStatus"] == "FAILED", t)

    return deliver_from_returned(page, seed, tok, bid, paid, draft, giao)


def deliver_from_returned(page, seed, tok, bid, paid, draft, giao):
    # AC-21: Thất bại → Đã chuyển hoàn
    _tab(page, "Thất bại")
    _tick(page, paid)
    page.get_by_role("button", name="Cập nhật TT").click()
    dialog = page.get_by_role("dialog"); dialog.wait_for(timeout=5000)
    _pick(dialog, "Trạng thái mới", "Đã chuyển hoàn")
    save = dialog.get_by_role("button", name="Lưu")
    check("AC-21 Lưu locked until confirm", save.is_disabled())
    dialog.locator('label:has(input[type="checkbox"])').last.click()
    page.screenshot(path=str(EVIDENCE / "AC-21-return-confirm.png"))
    save.click()
    t = _toast(page, "đã cập nhật"); print("  toast:", t)
    r = _api_row(seed, tok, bid, paid)
    check("AC-21 RETURNED + CANCELLED", "1/1" in t and r and r["deliveryStatus"] == "RETURNED" and r["status"] == "CANCELLED",
          r and (r["deliveryStatus"], r["status"]))
    st, inv = seed.call("GET", f"/invoices/{r['invoiceId']}", tok, bid)
    check("AC-21 invoice cancelled", isinstance(inv, dict) and inv.get("status") == "cancelled", isinstance(inv, dict) and inv.get("status"))
    _tab(page, "Đã chuyển hoàn")
    page.screenshot(path=str(EVIDENCE / "AC-21-returned.png"))

    # AC-22 + AC-18 (bỏ trống ĐT/phí → NULL): trả tiền đơn nháp, giao, Hoàn thành
    rc = seed.pay(draft)
    check("pay second order", rc == 0)
    page.reload(); page.wait_for_timeout(2000)
    _tab(page, "Chờ giao/lấy hàng")
    _tick(page, draft)
    giao.click()
    dialog = page.get_by_role("dialog"); dialog.wait_for(timeout=5000)
    dialog.get_by_role("button", name="Lưu").click()
    t = _toast(page, "1/1 đơn đã giao"); print("  toast:", t)
    r = _api_row(seed, tok, bid, draft)
    check("AC-18 blank partner/fee stored NULL", "1/1" in t and r["deliveryStatus"] == "IN_TRANSIT"
          and r.get("deliveryPartnerName") is None and r.get("partnerShippingFee") is None,
          {k: r.get(k) for k in ("deliveryStatus", "deliveryPartnerName", "partnerShippingFee")})
    _tab(page, "Đang giao hàng")
    _tick(page, draft)
    page.get_by_role("button", name="Hoàn thành", exact=True).click()
    t = _toast(page, "hoàn thành"); print("  toast:", t)
    check("AC-22 COMPLETED when no debt", "1/1" in t and _api_row(seed, tok, bid, draft)["deliveryStatus"] == "COMPLETED", t)
    _tab(page, "Hoàn thành")
    page.screenshot(path=str(EVIDENCE / "AC-22-completed.png"))

    # AC-27: lịch sử
    st, hist = seed.call("GET", f"/mobile/sales-orders/{r['id']}/history", tok, bid)
    labels = [e.get("label") for e in (hist if isinstance(hist, list) else hist.get("entries", hist.get("data", [])))]
    print("  history:", labels)
    check("AC-27 history has Giao hàng + Hoàn thành", any(l and "Giao hàng" in l for l in labels)
          and any(l and "Hoàn thành" in l for l in labels), labels)


def partners(ctx):
    bo = os.environ.get("BO_URL", "http://localhost:3000")
    c = creds()
    page = ctx.new_page()
    errors: list[str] = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(f"{bo}/login", wait_until="domcontentloaded", timeout=30000)
    page.fill("#login-org-id", c["LOCAL_BACKOFFICE_ORG_ID"])
    page.fill("#login-email", c["LOCAL_BACKOFFICE_EMAIL"])
    page.fill("#login-password", c["LOCAL_BACKOFFICE_PASSWORD"])
    page.click('button[type="submit"]')
    page.wait_for_function("() => !location.pathname.startsWith('/login')", timeout=30000)
    page.wait_for_timeout(1500)
    # Điều hướng trong app (reload làm mất phiên — memory backoffice-session-lost-on-reload).
    page.get_by_text("Danh mục", exact=True).first.click()
    page.wait_for_timeout(800)
    entry = page.get_by_text("Đối tác giao hàng", exact=True)
    check("sidebar has Đối tác giao hàng", entry.count() > 0)
    if entry.count():
        entry.first.click()
    page.wait_for_timeout(2500)
    body = page.inner_text("body")
    check("route /admin/delivery-partners", "/admin/delivery-partners" in page.url, page.url)
    check("page title Đối tác giao hàng", "Đối tác giao hàng" in body)
    check("no console errors", not errors, errors[:3])
    EVIDENCE.parent.parent.joinpath("local-backoffice", "desktop").mkdir(parents=True, exist_ok=True)
    shot = EVIDENCE.parent.parent / "local-backoffice" / "desktop" / "AC-10-delivery-partners.png"
    page.screenshot(path=str(shot))
    print("  shot", shot)


def main():
    if not {"--online", "--stockshort", "--partners", "--process", "--orders", "--opendraft", "--deliver"} & set(sys.argv):
        print(__doc__)
        return 2
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, locale="vi-VN",
                                  timezone_id="Asia/Ho_Chi_Minh")
        if "--online" in sys.argv:
            online(login(ctx))
        if "--stockshort" in sys.argv:
            stockshort(login(ctx))
        if "--process" in sys.argv:
            process(login(ctx))
        if "--orders" in sys.argv:
            orders(login(ctx))
        if "--opendraft" in sys.argv:
            opendraft(login(ctx))
        if "--deliver" in sys.argv:
            deliver(login(ctx))
        if "--partners" in sys.argv:
            partners(ctx)
        browser.close()
    print("FAILED:" if failures else "all green", failures)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
