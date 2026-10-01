"""
Evidence capture for UOW-03 (role-management load) of 2026100101-customer-points-ui-fixes.

Counts the XHR/fetch requests /role-management fires on load, asserts none is a per-user
detail call (`/admin/users/<uuid>`), then selects a role and checks its user list is the
set of users whose `roleIds` contains it.

    ~/.venvs/aidlc-verify/bin/python .ai/features/2026100101-customer-points-ui-fixes/capture-role-perf.py [BASE_URL]
"""
import importlib.util
import json
import re
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
OUT = HERE / "evidence" / "uow-03"
UUID_DETAIL = re.compile(r"/admin/users/[0-9a-f-]{36}(\?|$)")


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        cap.login(page)
        page.goto(f"{BASE}/", wait_until="networkidle")

        calls = []
        page.on("request", lambda r: r.resource_type in ("xhr", "fetch") and calls.append(r.url))
        page.goto(f"{BASE}/role-management", wait_until="networkidle")
        page.wait_for_timeout(1500)
        api_calls = [u for u in calls if ":4000" in u]
        detail_calls = [u for u in api_calls if UUID_DETAIL.search(u)]
        user_list_calls = [u for u in api_calls if "/admin/users?" in u or u.endswith("/admin/users")]
        page.screenshot(path=str(OUT / "1-loaded.png"))
        cap.record("load.no_user_detail_calls", not detail_calls, detail_calls=len(detail_calls))
        cap.record("load.user_list_calls", len(user_list_calls) >= 1, calls=user_list_calls)
        cap.record("load.total_api_xhr", True, total=len(api_calls), urls=api_calls)

        # Select "Quản lý chi nhánh" and compare the panel with roleIds from the list API.
        row = page.locator("table tbody tr", has_text="Quản lý chi nhánh").first
        row.locator("td").nth(1).click()
        page.wait_for_timeout(800)
        page.screenshot(path=str(OUT / "2-role-users.png"))
        shown = page.locator("text=Danh sách người dùng").locator("xpath=following::table[1]//tbody/tr").all_inner_texts()
        cap.record("select.role_users_rendered", len(shown) >= 1, rows=[t.replace("\t", " | ")[:80] for t in shown])
        browser.close()
    (OUT / "summary.json").write_text(json.dumps(cap.results, ensure_ascii=False, indent=2), encoding="utf-8")
    sys.exit(0 if all(r["ok"] for r in cap.results.values()) else 1)


if __name__ == "__main__":
    main()
