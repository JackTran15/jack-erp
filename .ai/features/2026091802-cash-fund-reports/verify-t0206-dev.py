"""T-02-06 — other domains keep the fixed subtitle (dev stack :3000, seed admin from .ai/credentials.env)."""
import asyncio, os, sys
from playwright.async_api import async_playwright
env = {}
for line in open("/Users/akenzy/Documents/work/erp/be/erp3/.ai/credentials.env"):
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1); env[k] = v.strip().strip('"')
BASE = "http://localhost:3000"; failures = []
def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))
    if not ok: failures.append(name)
async def subtitle(page):
    try: await page.wait_for_selector("h1", timeout=8000)
    except Exception: return ["<no h1: " + (await page.inner_text("body"))[-90:].replace("\n", " | ") + ">"]
    return await page.eval_on_selector("h1", "h => Array.from(h.parentElement.querySelectorAll('p')).map(p => p.textContent.trim())")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); page = await (await b.new_context(viewport={"width": 1440, "height": 900})).new_page()
        await page.goto(f"{BASE}/login", wait_until="networkidle")
        await page.fill("#login-org-id", env["LOCAL_BACKOFFICE_ORG_ID"]); await page.fill("#login-email", env["LOCAL_BACKOFFICE_EMAIL"]); await page.fill("#login-password", env["LOCAL_BACKOFFICE_PASSWORD"])
        await page.click("button[type=submit]"); await page.wait_for_url(lambda u: "/login" not in u, timeout=20000)
        for mode, expect in [("single", "Xem theo chi nhánh"), ("chain", "Xem theo chuỗi cửa hàng")]:
            await page.evaluate(f"localStorage.setItem('bo-active-branch', JSON.stringify({{state:{{isChain:{'true' if mode == 'chain' else 'false'}}},version:0}}))")
            for path in ["/reports/sales", "/reports/inventory", "/reports/debts", "/reports/profit", "/reports/cash-fund"]:
                await page.goto(f"{BASE}{path}", wait_until="networkidle"); await page.wait_for_timeout(1200)
                st = await subtitle(page)
                if st and st[0].startswith("<no h1"): print(f"SKIP {mode} {path}: {st[0][:80]}"); continue
                t = (await page.inner_text("h1")).strip()
                check(f"{mode} {path} ({t[:32]}) subtitle == '{expect}'", st == [expect], str(st))
        await page.screenshot(path="evidence/t0206-06-dev-other-domains.png")
        await b.close()
    print("\n" + ("ALL PASS" if not failures else f"{len(failures)} FAILED: {failures}")); sys.exit(1 if failures else 0)
asyncio.run(main())
