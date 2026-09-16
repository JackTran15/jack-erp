"""
Mint the `local-pos` storage-state session for ai-dlc-verify.

Why: the runner's `form` recipe is a two-field flow (user → submit → password), while the
POS sign-in puts ID tổ chức + email + mật khẩu on one screen, so it submits an incomplete
form and reports "credentials were rejected". `establish_session` loads
`.ai/.auth/<env>.json` when it exists and only logs in if it still lands on the sign-in
route — so minting the session here makes the recipe irrelevant (same trick as
`.ai/capture-session.py` for backoffice).

Reads LOCAL_BACKOFFICE_ORG_ID / _EMAIL / _PASSWORD from `.ai/credentials.env` — the
LOCAL_POS_* entries point at an org and a branch id that no longer exist in erp_dev
(A-12 of this feature). Pins branch Hồ Chí Minh by id and waits for the POS shell so the
session is captured after `pos-branch` has been written to localStorage.

Sessions expire after ~15 minutes — re-run before each verify run:

    ~/.venvs/aidlc-verify/bin/python .ai/features/2026091602-pos-catalog-product-images/capture-pos-session.py
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
CRED = ROOT / ".ai" / "credentials.env"
OUT = ROOT / ".ai" / ".auth" / "local-pos.json"
URL = "http://localhost:3001/pos"
HCM = "c3bf1922-3a2e-42d9-b00d-a7129efe592c"


def creds():
    values = {}
    for line in CRED.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        values[k.strip()] = v.strip().strip('"')
    return values


def main():
    c = creds()
    org, email, password = (c.get(k, "") for k in
                            ("LOCAL_BACKOFFICE_ORG_ID", "LOCAL_BACKOFFICE_EMAIL", "LOCAL_BACKOFFICE_PASSWORD"))
    if not (org and email and password):
        sys.exit("missing LOCAL_BACKOFFICE_* credentials")
    OUT.parent.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.goto(f"{URL}/dang-nhap", wait_until="domcontentloaded", timeout=30000)
        page.fill("#pos-login-org-id", org)
        page.fill("#pos-login-email", email)
        page.fill("#pos-login-password", password)
        page.click('button[type="submit"]')
        page.wait_for_selector('input[name="pos-branch"]', timeout=30000)
        page.click(f'input[name="pos-branch"][value="{HCM}"]')
        page.click('button[type="submit"]')
        page.wait_for_selector('[aria-label="Sapo POS"]', timeout=30000)
        ctx.storage_state(path=str(OUT))
        print(f"session written: {OUT.relative_to(ROOT)}  (url={page.url})")
        browser.close()


if __name__ == "__main__":
    main()
