#!/usr/bin/env python
"""
Mint a storage-state session for ai-dlc-verify's backoffice environment.

Why this exists: the runner's `form` recipe is a two-step, two-field flow — it
fills one field, submits, then looks for a password box. This app's sign-in page
puts THREE fields on one screen (ID tổ chức, email, mật khẩu) and the recipe has
no concept of the third, so it submits an incomplete form and the run dies with
"credentials were rejected" even though the credentials are perfectly good
(POST /auth/login returns 200 for the same values).

`establish_session` in runner/run.py loads `.ai/.auth/<env>.json` when it exists
and only attempts a login if it still lands on the sign-in route. So minting the
session here makes the broken recipe irrelevant without touching aidlc.yaml.

Sessions expire after roughly 15 minutes — re-run this before each verify run.

    ~/.venvs/aidlc-verify/bin/python .ai/capture-session.py
"""
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
CRED = ROOT / ".ai" / "credentials.env"
OUT = ROOT / ".ai" / ".auth" / "local-backoffice.json"
URL = "http://localhost:3000"


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
    org = c.get("LOCAL_BACKOFFICE_ORG_ID", "")
    email = c.get("LOCAL_BACKOFFICE_EMAIL", "")
    password = c.get("LOCAL_BACKOFFICE_PASSWORD", "")
    branch = c.get("LOCAL_BACKOFFICE_BRANCH_NAME", "")
    if not (org and email and password):
        sys.exit("missing LOCAL_BACKOFFICE_* credentials")

    OUT.parent.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()

        page.goto(f"{URL}/login", wait_until="domcontentloaded", timeout=30000)
        page.fill("#login-org-id", org)
        page.fill("#login-email", email)
        page.fill("#login-password", password)
        page.click('button[type="submit"]')

        # Wait for the shell, not for a toast: RequireAuth renders a restoring
        # state first, and a toast can come and go before we look.
        page.wait_for_url(lambda u: "/login" not in u, timeout=30000)
        page.wait_for_selector("button.w-52", timeout=30000)

        # Pin the branch the same way the config's post_login does. This has to
        # go through the UI: switch-branch mints a NEW token and ActorContext
        # resolves branchId from the JWT before the header.
        if branch:
            try:
                page.click("button.w-52", timeout=10000)
                page.click(f'[role="menuitemradio"]:has-text("{branch}")', timeout=10000)
                page.wait_for_selector(f'button.w-52:has-text("{branch}")', timeout=30000)
            except Exception as exc:                      # noqa: BLE001
                print(f"  branch pin skipped: {type(exc).__name__}")

        ctx.storage_state(path=str(OUT))
        print(f"session written: {OUT.relative_to(ROOT)}  (url={page.url})")
        browser.close()


if __name__ == "__main__":
    main()
