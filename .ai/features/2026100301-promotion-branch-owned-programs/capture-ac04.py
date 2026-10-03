"""AC-04 evidence (T-01-07): "Cửa hàng áp dụng" locked for a branch manager.

Backoffice of THIS checkout on :3005 (VITE_API_BASE_URL=http://localhost:4000), API :4000 on
erp_dev_3008. Logs in with LOCAL_BACKOFFICE_* (a chain manager) and switches to
LOCAL_BACKOFFICE_BRANCH_NAME.

SIMULATED branch manager: `.ai/credentials.env` has no LOCAL_BACKOFFICE_BM_* account, so the
script drops `promotion.chain.manage` from `user_permissions` in localStorage and navigates
client-side (a reload would restore it from GET /auth/session). Only the UI is simulated — the
API still treats this session as a chain manager.

Run: ~/.venvs/aidlc-verify/bin/python .ai/features/2026100301-promotion-branch-owned-programs/capture-ac04.py
"""
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent / "evidence"
BASE = "http://localhost:3005"


def creds() -> dict[str, str]:
    values = {}
    for line in (ROOT / ".ai/credentials.env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    return values


def spa_go(page, path: str) -> None:
    page.evaluate(
        "p => { window.history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); }",
        path,
    )


def main() -> None:
    c = creds()
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        try:
            run(page, c)
        except Exception:
            page.screenshot(path=str(OUT / "debug-failure.png"), full_page=True)
            print("FAILED at", page.url)
            raise
        finally:
            browser.close()


def run(page, c: dict[str, str]) -> None:
    if True:
        page.goto(f"{BASE}/login")
        page.fill("#login-org-id", c["LOCAL_BACKOFFICE_ORG_ID"])
        page.fill("#login-email", c["LOCAL_BACKOFFICE_EMAIL"])
        page.fill("#login-password", c["LOCAL_BACKOFFICE_PASSWORD"])
        page.click('button[type="submit"]')
        page.wait_for_url(lambda url: "/login" not in url, timeout=30_000)

        branch = c["LOCAL_BACKOFFICE_BRANCH_NAME"]
        page.click("button.w-52")
        page.click(f'[role="menuitemradio"]:has-text("{branch}")')
        page.wait_for_selector(f'button.w-52:has-text("{branch}")', timeout=30_000)

        # 1. Chain manager viewing one branch: no store-scope section, as before
        #    (variants render it only in "Toàn chuỗi" view or when locked).
        page.goto(f"{BASE}/promotions/programs/new?type=PRODUCT_DISCOUNT")
        page.wait_for_selector("text=Thông tin chung", timeout=30_000)
        assert page.locator("text=Cửa hàng áp dụng").count() == 0, "chain manager in branch view: section hidden"

        # 2. Simulated branch manager: the section is locked to the active branch.
        spa_go(page, "/promotions/programs")
        page.wait_for_selector("text=Đơn vị quản lý", timeout=30_000)
        page.screenshot(path=str(OUT / "ac13-owner-column.png"), full_page=False)

        # AC-13: chain manager filters by "Đơn vị quản lý".
        owner_select = page.locator('select:has(option:text-is("Toàn chuỗi"))')
        owner_select.select_option(label="Toàn chuỗi")
        page.wait_for_timeout(1500)
        print("owner=Toàn chuỗi rows:", page.locator("tbody tr").count())
        page.screenshot(path=str(OUT / "ac13-filter-chain.png"), full_page=False)
        owner_select.select_option(label=branch)
        page.wait_for_timeout(1500)
        print(f"owner={branch} empty:", page.locator("text=Không có chương trình khuyến mãi.").count() == 1)
        page.screenshot(path=str(OUT / "ac13-filter-branch.png"), full_page=False)
        owner_select.select_option(index=0)
        page.wait_for_timeout(800)
        page.evaluate(
            """() => {
              const key = 'user_permissions';
              const perms = JSON.parse(localStorage.getItem(key) || '[]');
              localStorage.setItem(key, JSON.stringify(perms.filter(p => p !== 'promotion.chain.manage')));
            }"""
        )
        spa_go(page, "/promotions/programs/new?type=PRODUCT_DISCOUNT")
        page.wait_for_selector("text=(chương trình của chi nhánh)", timeout=30_000)
        page.locator("text=Cửa hàng áp dụng").scroll_into_view_if_needed()
        assert page.locator('input[name="store-scope"]').count() == 0, "branch manager must not see the radio"
        locked = page.locator("text=(chương trình của chi nhánh)").locator("xpath=..").inner_text()
        print("locked section:", locked)
        page.screenshot(path=str(OUT / "ac04-branch-manager-locked.png"), full_page=True)

        # AC-13: the simulated branch manager sees the column without a filter control.
        spa_go(page, "/promotions/programs")
        page.wait_for_selector("text=Đơn vị quản lý", timeout=30_000)
        page.wait_for_timeout(1000)
        assert page.locator('select:has(option:text-is("Toàn chuỗi"))').count() == 0, "branch manager: no owner filter"
        page.screenshot(path=str(OUT / "ac13-branch-manager-no-filter.png"), full_page=False)

        # AC-09: selecting a chain program disables Sửa / Xóa; Nhân bản stays.
        page.locator("tbody tr").first.locator('input[type="checkbox"]').check()
        page.wait_for_timeout(300)
        for label, disabled in (("Sửa", True), ("Xóa", True), ("Nhân bản", False)):
            button = page.locator(f'button:has-text("{label}")').first
            assert button.is_disabled() == disabled, f"{label} disabled should be {disabled}"
        page.screenshot(path=str(OUT / "ac09-list-actions-disabled.png"), full_page=False)

        # AC-09: chain programs open read-only. Only INVOICE_DISCOUNT and ITEM_DISCOUNT
        # exist in this org on erp_dev_3008.
        for slug, program_id in (
            ("invoice-discount", "619dd8a2-c215-4c39-8602-2b9dc20f9caf"),
            ("item-discount", "923525f9-2477-4e64-b67f-22e1ff0dd9a2"),
        ):
            spa_go(page, "/promotions/programs")  # a fresh mount per program
            page.wait_for_selector("text=Đơn vị quản lý", timeout=30_000)
            spa_go(page, f"/promotions/programs/{program_id}/edit")
            page.wait_for_selector("text=Chương trình do công ty quản lý — chỉ xem", timeout=30_000)
            page.wait_for_selector('input[placeholder="Nhập tên chương trình"]', timeout=30_000)
            assert page.locator('button:has-text("Lưu")').count() == 0, "no Lưu / Lưu và thêm mới"
            assert page.locator('button:has-text("Quay lại")').count() == 1
            name_input = page.locator('input[placeholder="Nhập tên chương trình"]')
            assert name_input.is_disabled(), "inputs disabled"
            page.screenshot(path=str(OUT / f"ac09-readonly-{slug}.png"), full_page=True)
            tab = page.locator('button:has-text("Điều kiện áp dụng")')
            if tab.count():
                tab.click()  # tabs sit outside the disabled fieldset
                page.wait_for_timeout(300)
                page.screenshot(path=str(OUT / f"ac09-readonly-{slug}-conditions.png"), full_page=True)
            print("read-only ok:", slug)


if __name__ == "__main__":
    main()
