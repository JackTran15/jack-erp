"""
Dựng dữ liệu demo cho UOW-02/04/05 trên DB local (Akenzy cho phép 2026-09-25:
"Mở ca + thanh toán trên local"). Chỉ gọi API công khai — không ghi DB trực tiếp.

  open-session   tìm chi nhánh đang giữ đơn web SENT, mở ca (nếu chưa mở) bằng
                 quỹ REGISTER của chi nhánh đó; in branchId
  pay <orderExt> thanh toán đủ tiền mặt hoá đơn nháp của đơn có mã OCM <orderExt>

Không bao giờ in mật khẩu hay token.
    python3 .ai/features/2026092402-pos-order-delivery-lifecycle/seed-demo.py open-session
"""
import json
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
API = "http://localhost:4000"


def creds():
    v = {}
    for line in (ROOT / ".ai" / "credentials.env").read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, val = line.split("=", 1)
            v[k.strip()] = val.strip().strip('"')
    return v


def call(method, path, token=None, branch=None, body=None):
    req = urllib.request.Request(API + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    if branch:
        req.add_header("X-Branch-Id", branch)
    if method != "GET":
        req.add_header("X-Idempotency-Key", str(uuid.uuid4()))
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data, timeout=30) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw.decode(errors="replace")[:300]


def login_to(branch_id=None):
    c = creds()
    st, b = call("POST", "/auth/login", body={
        "email": c["LOCAL_BACKOFFICE_EMAIL"], "password": c["LOCAL_BACKOFFICE_PASSWORD"],
        "organizationId": c["LOCAL_BACKOFFICE_ORG_ID"]})
    assert st in (200, 201), (st, b)
    tok = b["accessToken"]
    if branch_id:
        st, b = call("POST", "/auth/switch-branch", tok, body={"branchId": branch_id})
        assert st in (200, 201), (st, b)
        tok = b["accessToken"]
    return tok


def branches(tok):
    # JWT payload mang `branchIds` (CLAUDE.md: { userId, organizationId, roles[], branchIds[], jti }).
    import base64
    part = tok.split(".")[1]
    payload = json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))
    return 200, payload.get("branchIds") or [], None


def rows_of(res):
    """`/cash/accounts/by-branch` trả `{data: [...], total, ...}`."""
    if isinstance(res, dict):
        return res.get("data") or []
    return res if isinstance(res, list) else []


def find_branch_with_orders(need_register=False):
    tok = login_to()
    st2, ids, me = branches(tok)
    if not ids:
        print("cannot list branches from /auth/me:", st2, list((me or {}).keys()) if isinstance(me, dict) else me)
        sys.exit(1)
    for bid in ids:
        t = login_to(bid)
        for ch in call("GET", "/mobile/sales-channels", t, bid)[1] or []:
            st, res = call("POST", "/v2/mobile/sales-orders/search", t, bid, {
                "view": "ONLINE", "channelId": ch["id"], "status": "SENT", "page": 1, "limit": 100})
            if st == 200 and res.get("total"):
                if need_register:
                    _, accts = call("GET", f"/cash/accounts/by-branch/{bid}", t, bid)
                    if not any(a.get("type") == "REGISTER" for a in rows_of(accts)):
                        break
                return bid, t, ch, res
    return None, None, None, None


def open_session():
    bid, tok, ch, res = find_branch_with_orders(need_register=True)
    if not bid:
        print("no branch holds SENT web orders AND a REGISTER cash account"); return 1
    print("branch", bid, "channel", ch["name"], "SENT orders:", [r["externalOrderId"] for r in res["data"]])
    st, accts = call("GET", f"/cash/accounts/by-branch/{bid}", tok, bid)
    reg = [a for a in rows_of(accts) if a.get("type") == "REGISTER"]
    print("register accounts:", [(a["id"], a.get("name")) for a in reg], "status", st)
    if not reg:
        return 1
    st, s = call("POST", "/pos/sessions/open", tok, bid,
                 {"branchId": bid, "cashAccountId": reg[0]["id"], "openingCashAmount": 0})
    print("open session:", st, s if st >= 400 else s.get("status"))
    if isinstance(s, dict) and s.get("id"):
        st, s2 = call("POST", f"/pos/sessions/{s['id']}/start-sales", tok, bid)
        print("start-sales:", st, s2.get("status") if isinstance(s2, dict) else s2)
    return 0


def pay(ext):
    bid, tok, ch, _ = find_branch_with_orders()
    tok = tok or login_to()
    # tìm đơn theo mã OCM trong view DELIVERY (đã nhận xử lý)
    st, res = call("POST", "/v2/mobile/sales-orders/search", tok, bid, {
        "view": "DELIVERY", "page": 1, "limit": 100, "columnFilters": {}})
    row = next((r for r in (res or {}).get("data", []) if r.get("externalOrderId") == ext), None)
    if not row:
        print("order not in DELIVERY view:", ext, st); return 1
    st, inv = call("GET", f"/invoices/{row['invoiceId']}", tok, bid)
    due = float(inv.get("amountDue") or inv.get("totalAmount") or 0)
    print("invoice", row["invoiceId"], "draft", row.get("invoiceIsDraft"), "due", due)
    st, out = call("POST", f"/invoices/{row['invoiceId']}/checkout", tok, bid,
                   {"payments": [{"paymentMethod": "cash", "amount": due}]})
    print("checkout:", st, out.get("status") if isinstance(out, dict) else out)
    return 0 if st in (200, 201) else 1


def partner(code, name):
    tok = login_to()
    st, b = call("POST", "/admin/entities/delivery-partners/records", tok, None,
                 {"code": code, "name": name, "isActive": True})
    print("create partner:", st, b.get("id") if isinstance(b, dict) and st < 300 else b)
    return 0 if st < 300 or st == 409 else 1


if __name__ == "__main__":
    if len(sys.argv) >= 4 and sys.argv[1] == "partner":
        sys.exit(partner(sys.argv[2], sys.argv[3]))
    if len(sys.argv) >= 2 and sys.argv[1] == "open-session":
        sys.exit(open_session())
    if len(sys.argv) >= 3 and sys.argv[1] == "pay":
        sys.exit(pay(sys.argv[2]))
    print(__doc__); sys.exit(2)
