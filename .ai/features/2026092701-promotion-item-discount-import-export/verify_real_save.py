"""UOW-01 pre-merge DoD: save through the UI for real (no route.abort), then SELECT.

Writes three PRODUCT_DISCOUNT programs named "VERIFY-UOW01 …" into the DB the API on
VERIFY_BASE's backend uses (erp_dev_3008). Reads target_type back via `docker exec
erp-postgres psql`. Then reopens the lookup program, saves unchanged, and re-reads.
Usage: ~/.venvs/aidlc-verify/bin/python verify_real_save.py
"""
import json
import subprocess
import time

from playwright.sync_api import sync_playwright

from verify_grid_ui import BASE, OUT, creds, login, open_form, pick, row, value_input

DB = "erp_dev_3008"
TAG = time.strftime("%H%M%S")
results = []


def expect(label, got, want):
    ok = got == want
    results.append(ok)
    print(f"{'PASS' if ok else 'FAIL'} {label}: got={got!r} want={want!r}")


def sql(q):
    out = subprocess.run(
        ["docker", "exec", "erp-postgres", "psql", "-U", "postgres", "-d", DB, "-tAF|", "-c", q],
        capture_output=True, text=True, check=True).stdout
    return [l.split("|") for l in out.strip().splitlines() if l]


def reward_types(program_id):
    return sql(
        "select l.target_type, coalesce(i.code, p.code, c.name, l.target_id::text), l.discount_value "
        "from promotion_lines l left join items i on i.id = l.target_id "
        "left join products p on p.id = l.target_id "
        "left join inventory_item_categories c on c.id = l.target_id "
        f"where l.program_id = '{program_id}' and l.role = 'REWARD' order by l.sort_order")


def save(page, method="POST"):
    with page.expect_response(
        lambda r: r.request.method == method and "/v2/promotions" in r.url
        and "/evaluate" not in r.url, timeout=20000,
    ) as resp:
        page.get_by_role("button", name="Lưu", exact=True).first.click()
        confirm = page.get_by_role("button", name="Vẫn lưu")
        try:
            confirm.wait_for(timeout=3000)
            confirm.click()
        except Exception:
            pass
    r = resp.value
    body = r.json() if r.ok else {}
    print(f"  {method} {r.status}")
    data = body.get("data", body)
    return data.get("id") if isinstance(data, dict) else None


def main():
    env = creds()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        login(page, env)

        # AC-01: lookup cell → ITEM
        open_form(page)
        page.get_by_placeholder("Nhập tên chương trình").fill(f"VERIFY-UOW01 lookup {TAG}")
        page.get_by_label("Hàng hóa", exact=True).check()
        pick(page, 0, "ABA2777-D-38")
        value_input(page, 0).fill("10")
        lookup_id = save(page)
        page.screenshot(path=str(OUT / "AC-01-saved.png"))
        rows = reward_types(lookup_id)
        print("  AC-01 rows:", rows)
        expect("AC-01 lookup row stored as ITEM", [r[0] for r in rows], ["ITEM"])

        # demo step 4: reopen, rows show code, save unchanged → target_type unchanged
        page.goto(f"{BASE}/promotions/programs/{lookup_id}/edit")
        page.wait_for_selector("text=Thiết lập", timeout=30000)
        page.wait_for_timeout(1500)
        code = row(page, 0).locator("td").first.locator("input").first.input_value()
        expect("reopen shows code", code, "ABA2777-D-38")
        page.screenshot(path=str(OUT / "AC-01-reopened.png"))
        save(page, method="PUT")
        expect("resave unchanged keeps ITEM", [r[0] for r in reward_types(lookup_id)], ["ITEM"])

        # AC-02: picker → whole product PRODUCT + one variant ITEM
        open_form(page)
        page.get_by_placeholder("Nhập tên chương trình").fill(f"VERIFY-UOW01 picker {TAG}")
        page.get_by_label("Hàng hóa", exact=True).check()
        row(page, 0).locator("td").first.locator("button").last.click()
        dlg = page.get_by_role("dialog")
        dlg.get_by_text("Chọn hàng hóa").wait_for()
        dlg.locator("tr", has_text="AAA-AIDLC-MULTI").locator("input[type=checkbox]").first.check()
        dlg.locator("tr", has_text="ABA2777").first.locator("button").first.click()
        page.wait_for_timeout(1000)
        dlg.locator("tr", has_text="ABA2777-D-38").locator("input[type=checkbox]").first.check()
        dlg.get_by_role("button", name="Chọn", exact=True).click()
        page.wait_for_timeout(500)
        for i in range(page.locator("tbody tr[data-row-index]").count() - 1):
            value_input(page, i).fill("5")
        picker_id = save(page)
        page.screenshot(path=str(OUT / "AC-02-saved.png"))
        rows = reward_types(picker_id)
        print("  AC-02 rows:", rows)
        expect("AC-02 picker stored as PRODUCT + ITEM", sorted(r[0] for r in rows), ["ITEM", "PRODUCT"])

        # group scope → CATEGORY
        open_form(page)
        page.get_by_placeholder("Nhập tên chương trình").fill(f"VERIFY-UOW01 group {TAG}")
        page.get_by_label("Nhóm hàng hóa", exact=True).check()
        page.wait_for_timeout(300)
        cell = row(page, 0).locator("td").first.locator("input").first
        cell.click()
        cell.fill("")
        cell.press("ArrowDown")
        page.locator('[role="option"]').first.click()
        page.wait_for_timeout(300)
        value_input(page, 0).fill("5")
        group_id = save(page)
        page.screenshot(path=str(OUT / "group-saved.png"))
        rows = reward_types(group_id)
        print("  group rows:", rows)
        expect("group scope stored as CATEGORY", [r[0] for r in rows], ["CATEGORY"])

        print(json.dumps({"lookup": lookup_id, "picker": picker_id, "group": group_id}))
        print("ALL PASS" if all(results) else "SOME FAILED")
        browser.close()


if __name__ == "__main__":
    main()
