"""
Evidence capture for UOW-04 (promotion blank rows) of 2026100101-customer-points-ui-fixes.

WRITES to erp_dev_3008: reproduces the client's legacy rows on program PROMO_ID by inserting
(a) a line saved the way mapper `85f4c1bf` did — an item id under target_type PRODUCT, which
the server cannot resolve, and (b) a valid ITEM line after it, so the blank row sits in the
middle like the screenshot. Then opens the program, types a code into the trailing row
without picking an item, saves through the UI, reopens and asserts the blank rows are gone.
Finally deletes line (b) so the program is back to its original single line.

    ~/.venvs/aidlc-verify/bin/python .ai/features/2026100101-customer-points-ui-fixes/capture-promo-blank-rows.py [BASE_URL]
"""
import importlib.util
import json
import os
import subprocess
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
OUT = HERE / "evidence" / "uow-04"
PROMO_ID = os.environ.get("PROMO_ID", "923525f9-2477-4e64-b67f-22e1ff0dd9a2")
LEGACY_ITEM = os.environ.get("LEGACY_ITEM", "74e63cf8-14c3-44ac-bbd5-fb4c9d9136bd")  # ABA2799-D-38
VALID_ITEM = os.environ.get("VALID_ITEM", "21e4114e-0f78-4e2a-9f6c-d0b08b987e4a")  # ABA2799-D-39
DB = os.environ.get("DB_NAME", "erp_dev_3008")


def sql(query):
    out = subprocess.run(
        ["docker", "exec", "erp-postgres", "psql", "-U", "erp_user", "-d", DB, "-Atc", query],
        capture_output=True, text=True, check=True,
    )
    return out.stdout.strip()


def grid_codes(page):
    """Code cell of every row of the goods-discount grid, '' for an empty row."""
    rows = page.locator("table tbody tr").filter(has=page.locator("input"))
    return [r.locator("input").first.input_value() for r in rows.all()]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sql(f"""
      INSERT INTO promotion_lines (id, organization_id, created_at, updated_at, created_by, program_id, group_id,
                                   role, target_type, target_id, discount_mode, discount_value, sort_order)
      SELECT gen_random_uuid(), organization_id, NOW(), NOW(), created_by, program_id, group_id,
             'REWARD', v.tt::promotion_target_type_enum, v.tid::uuid, discount_mode, discount_value, v.so
        FROM promotion_lines l,
             (VALUES ('PRODUCT', '{LEGACY_ITEM}', 1), ('ITEM', '{VALID_ITEM}', 2)) AS v(tt, tid, so)
       WHERE l.program_id = '{PROMO_ID}' AND l.role = 'REWARD' AND l.sort_order = 0
    """)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        cap.login(page)
        page.goto(f"{BASE}/promotions/programs/{PROMO_ID}/edit", wait_until="networkidle")
        page.locator("table tbody tr input").first.wait_for(timeout=30000)
        before = grid_codes(page)
        page.screenshot(path=str(OUT / "1-legacy-blank-row.png"), full_page=True)
        cap.record("before.blank_in_middle", len(before) >= 3 and before[1] == "" and before[2] != "", codes=before)

        # A code typed into the trailing row without choosing an item (targetId stays empty).
        trailing = page.locator("table tbody tr").filter(has=page.locator("input")).last.locator("input").first
        trailing.fill("ABA2799-D-40")
        page.keyboard.press("Escape")
        writes = []
        page.on("response", lambda r: r.request.method in ("PUT", "PATCH", "POST") and "/promotions" in r.url
                and writes.append(f"{r.request.method} {r.status} {r.url}"))
        page.click("button:has-text('Lưu') >> nth=0")
        # The fixture program has no end date, which asks for confirmation first.
        confirm = page.locator("button:has-text('Vẫn lưu')")
        try:
            confirm.wait_for(timeout=3000)
            confirm.click()
        except Exception:
            pass
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1500)
        toasts = page.locator("[data-sonner-toast]").all_inner_texts()
        page.screenshot(path=str(OUT / "1b-after-click-save.png"), full_page=True)
        cap.record("save.request", any(" 200 " in w or " 201 " in w for w in writes), writes=writes, toasts=toasts)

        page.goto(f"{BASE}/promotions/programs/{PROMO_ID}/edit", wait_until="networkidle")
        page.locator("table tbody tr input").first.wait_for(timeout=30000)
        after = grid_codes(page)
        page.screenshot(path=str(OUT / "2-after-save.png"), full_page=True)
        saved = sql(f"SELECT string_agg(target_type || ':' || target_id, ',' ORDER BY sort_order) FROM promotion_lines "
                    f"WHERE program_id = '{PROMO_ID}' AND role = 'REWARD'")
        cap.record("after.no_blank_in_middle", "" not in after[:-1] and after[-1] == "" and len(after) == 3,
                   codes=after, savedLines=saved)
        cap.record("after.legacy_line_dropped", LEGACY_ITEM not in saved and VALID_ITEM in saved, savedLines=saved)
        browser.close()

    sql(f"DELETE FROM promotion_lines WHERE program_id = '{PROMO_ID}' AND target_id IN ('{VALID_ITEM}', '{LEGACY_ITEM}')")
    cap.record("cleanup", sql(f"SELECT count(*) FROM promotion_lines WHERE program_id = '{PROMO_ID}' AND role = 'REWARD'") == "1")
    (OUT / "summary.json").write_text(json.dumps(cap.results, ensure_ascii=False, indent=2), encoding="utf-8")
    sys.exit(0 if all(r["ok"] for r in cap.results.values()) else 1)


if __name__ == "__main__":
    main()
