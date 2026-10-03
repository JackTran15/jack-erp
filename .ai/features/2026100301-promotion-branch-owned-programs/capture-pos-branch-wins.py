"""UOW-03 POS evidence (2026100301): a branch's own program wins at its own POS.

Every number is read from the DOM and asserted; exits 1 on any failed check.

Needs, on the DB the :4000 API is bound to (erp_dev_3008, org f1000000-…):
  - SKU-685 (685.000) and KM000003 "CTKM-A hang hoa 10% SKU-685" (chain, priority 1, auto)
  - LOCAL_BACKOFFICE_BM_* in .ai/credentials.env = a *Quản lý chi nhánh* of Hồ Chí Minh
  - pos-web of THIS checkout on :3001 (VITE_API_BASE_URL=http://localhost:4000)

Flow:
  1. The branch manager creates program B (ITEM_DISCOUNT 20% on SKU-685, priority 100) through
     POST /v2/promotions with their own token — the real create path; B must come back
     owned by HCM and pinned to [HCM].
  2. POS at HCM (admin login): SKU-685 gets B (548.000), not the better-priority chain A.
  3. POS at HCM, cashier picks A in the program dialog: A wins (616.500) — selection outranks ownership.
  4. POS at Hà Nội: SKU-685 gets A (616.500); B is not offered.
  5. Always: the branch manager deletes B.

Run: ~/.venvs/aidlc-verify/bin/python .ai/features/2026100301-promotion-branch-owned-programs/capture-pos-branch-wins.py
"""
import json
import os
import sys
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

FEATURE = Path(__file__).resolve().parent
ROOT = FEATURE.parents[2]
EVIDENCE = FEATURE / "evidence"
API = os.environ.get("API_URL", "http://localhost:4000")
POS = os.environ.get("POS_URL", "http://localhost:3001") + "/pos"
HCM = "c3bf1922-3a2e-42d9-b00d-a7129efe592c"
HN = "09743ddb-4db6-4926-9a79-9921e7f7fd55"
SKU685_ID = "88455098-3680-435a-baf1-8c623229a36c"
SEARCH = 'input[placeholder="(F3) Nhập tên hàng hóa, mã vạch, mã SKU"]'
GRID = '[role="grid"][aria-label="Danh sách chương trình khuyến mãi"]'
NAME_A = "CTKM-A hang hoa 10% SKU-685"
NAME_B = "CTKM-HCM hang hoa 20% SKU-685 - claude test"

failures: list[str] = []


def check(name: str, cond: bool, detail=""):
    print(f"  {'ok ' if cond else 'FAIL'} {name} {detail}")
    if not cond:
        failures.append(name)


def creds() -> dict[str, str]:
    values = {}
    for line in (ROOT / ".ai/credentials.env").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            values[k.strip()] = v.strip().strip('"')
    return values


def api(method: str, path: str, token: str | None = None, body=None, branch: str = HCM):
    req = urllib.request.Request(f"{API}{path}", method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("X-Branch-Id", branch)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    data = json.dumps(body).encode() if body is not None else None
    with urllib.request.urlopen(req, data=data, timeout=30) as res:
        raw = res.read()
        return json.loads(raw) if raw else None


def bm_token(c) -> str:
    body = {"email": c["LOCAL_BACKOFFICE_BM_EMAIL"], "password": c["LOCAL_BACKOFFICE_BM_PASSWORD"],
            "organizationId": c["LOCAL_BACKOFFICE_BM_ORG_ID"]}
    return api("POST", "/auth/login", body=body)["accessToken"]


def create_b(token: str) -> str:
    body = {
        "type": "ITEM_DISCOUNT", "name": NAME_B, "applyTo": "ALL_CUSTOMERS", "autoApply": True,
        "priority": 100,
        # Submitted as whole chain on purpose: the server must pin it to HCM (AC-01).
        "branchIds": [],
        "groups": [{"ordinal": 0, "lines": [{
            "role": "REWARD", "targetType": "ITEM", "targetId": SKU685_ID,
            "discountMode": "PERCENT", "discountValue": 20, "sortOrder": 0}]}],
    }
    return api("POST", "/v2/promotions", token, body)["id"]


def pos_login(ctx, c, branch_id: str):
    page = ctx.new_page()
    page.goto(f"{POS}/dang-nhap", wait_until="domcontentloaded", timeout=30000)
    page.fill("#pos-login-org-id", c["LOCAL_BACKOFFICE_ORG_ID"])
    page.fill("#pos-login-email", c["LOCAL_BACKOFFICE_EMAIL"])
    page.fill("#pos-login-password", c["LOCAL_BACKOFFICE_PASSWORD"])
    page.click('button[type="submit"]')
    page.wait_for_selector('input[name="pos-branch"]', timeout=30000)
    page.click(f'input[name="pos-branch"][value="{branch_id}"]')
    page.click('button[type="submit"]')
    page.wait_for_selector('[aria-label="Sapo POS"]', timeout=30000)
    page.wait_for_selector(SEARCH, timeout=30000)
    return page


def settle(page):
    page.wait_for_timeout(1500)
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
    net = cell.inner_text().split("\n")[-1].strip()
    return {"labels": labels, "net": net}


def open_programs(page) -> list[str]:
    page.click('button[aria-label="Voucher / quà tặng"]')
    page.wait_for_selector(GRID, timeout=15000)
    page.wait_for_timeout(500)
    return [" ".join(t.split()) for t in page.locator(f'{GRID} [role="row"]').all_inner_texts()]


def main() -> int:
    c = creds()
    missing = [k for k in ("LOCAL_BACKOFFICE_BM_ORG_ID", "LOCAL_BACKOFFICE_BM_EMAIL", "LOCAL_BACKOFFICE_BM_PASSWORD") if not c.get(k)]
    if missing:
        print("missing in .ai/credentials.env:", ", ".join(missing))
        return 2
    EVIDENCE.mkdir(exist_ok=True)

    token = bm_token(c)
    program_b = create_b(token)
    try:
        print("== 1. B created by the branch manager")
        detail = api("GET", f"/v2/promotions/{program_b}", token)
        check("B owned by HCM", detail["ownerBranchId"] == HCM, detail["ownerBranchId"])
        check("B pinned to [HCM] although [] was sent", detail["branchIds"] == [HCM], str(detail["branchIds"]))

        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            page = pos_login(ctx, c, HCM)

            print("== 2. POS at HCM — branch wins")
            add_sku(page, "SKU-685")
            r = row_info(page, "SKU-685")
            print("  row", r)
            check("AC-16 SKU-685 gets B", any(NAME_B in l for l in r["labels"]) and not any(NAME_A in l for l in r["labels"]), str(r["labels"]))
            check("AC-16 net 548.000 (20% off)", r["net"] == "548.000", r["net"])
            page.screenshot(path=str(EVIDENCE / "pos-hcm-branch-wins.png"))

            print("== 3. POS at HCM — cashier picks the chain program")
            rows = open_programs(page)
            print("  dialog rows", rows)
            page.screenshot(path=str(EVIDENCE / "pos-hcm-program-dialog.png"))
            page.locator(f'{GRID} [role="row"]:has-text("{NAME_A}")').click()
            page.wait_for_timeout(800)
            page.screenshot(path=str(EVIDENCE / "pos-hcm-pick-a-dialog.png"))
            apply_button = page.locator('button:has-text("Áp dụng")').last
            if apply_button.count():
                apply_button.click()
            page.keyboard.press("Escape")
            settle(page)
            r = row_info(page, "SKU-685")
            print("  row", r)
            check("AC-18 picked chain A wins", any(NAME_A in l for l in r["labels"]) and r["net"] == "616.500", str(r))
            page.screenshot(path=str(EVIDENCE / "pos-hcm-cashier-picks-a.png"))
            ctx.close()

            print("== 4. POS at Hà Nội — B out of scope")
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            page = pos_login(ctx, c, HN)
            add_sku(page, "SKU-685")
            r = row_info(page, "SKU-685")
            print("  row", r)
            check("AC-17 SKU-685 gets A at HN", any(NAME_A in l for l in r["labels"]) and r["net"] == "616.500", str(r))
            rows = open_programs(page)
            print("  dialog rows", rows)
            check("AC-17 B not offered at HN", not any(NAME_B in row for row in rows))
            page.screenshot(path=str(EVIDENCE / "pos-hn-chain-applies.png"))
            browser.close()
    finally:
        api("DELETE", f"/v2/promotions/{program_b}", token)
        print("cleanup: B deleted by the branch manager")

    print("FAILED:", failures) if failures else print("ALL CHECKS PASSED")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
