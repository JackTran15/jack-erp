#!/usr/bin/env python3
"""Bằng chứng ở tầng API cho bất biến `limit` và bất biến **trang** của ba endpoint POS.

Lý do tồn tại: chi nhánh HCM chỉ có ít dòng đủ điều kiện, trong khi cỡ trang nhỏ
nhất mà UI cho chọn là 50 ⇒ lưới luôn vừa một trang, không dựng được cảnh "sang
trang 2" trên màn hình. API thì nhận `limit` nhỏ tuỳ ý, nên ở đây ép `limit = 2`
rồi duyệt **hết** các trang: nếu footer bị tính theo trang, `totals` sẽ đổi giữa
các trang — đó chính là lỗi đang sửa.

Chạy:
    python3 .ai/features/footer-grand-totals-pos/probe-totals.py

In ra bảng markdown; chép vào `09-api-probe.md` kèm ngày chạy.
"""
import json
import pathlib
import urllib.request

REPO = pathlib.Path(__file__).resolve().parents[3]
API = "http://localhost:4000"

env = {}
for line in (REPO / ".ai/credentials.env").read_text().splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()


def post(path, body, token=None, branch=None):
    req = urllib.request.Request(
        API + path,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    if branch:
        req.add_header("X-Branch-Id", branch)
    with urllib.request.urlopen(req) as r:
        return json.load(r)


login = post(
    "/auth/login",
    {
        "email": env["LOCAL_POS_EMAIL"],
        "password": env["LOCAL_POS_PASSWORD"],
        "organizationId": env["LOCAL_POS_ORG_ID"],
    },
)
branch = env["LOCAL_POS_BRANCH_ID"]
session = post("/auth/switch-branch", {"branchId": branch}, token=login["accessToken"])
token = session["accessToken"]

# customerId của "Khách quen" — tab Lịch sử mua hàng luôn gắn với một khách.
customer = post(
    "/v2/customers/search",
    {"page": 1, "limit": 1, "name": {"operator": "*", "value": "Khách quen"}},
    token=token,
    branch=branch,
)["data"][0]["id"]

CASES = [
    ("Danh sách hóa đơn", "/v2/invoices/search", {}),
    ("Đổi trả hàng", "/v2/invoices/returnable/search", {}),
    ("Lịch sử mua hàng", "/v2/invoices/purchase-history/search", {"customerId": customer}),
]

print("| Bảng | Tập | Bất biến `limit` (1 / 5 / 100) | Bất biến trang (`limit=2`, mọi trang) |")
print("| --- | ---: | --- | --- |")

failures = 0
for label, path, extra in CASES:
    def call(body):
        return post(path, {**extra, **body}, token=token, branch=branch)

    by_limit = [call({"page": 1, "limit": n}) for n in (1, 5, 100)]
    baseline = by_limit[0]
    limit_ok = all(
        r["totals"] == baseline["totals"] and r["total"] == baseline["total"]
        for r in by_limit
    )

    total = baseline["total"]
    pages = max(1, -(-total // 2))  # ceil
    by_page = [call({"page": p, "limit": 2}) for p in range(1, pages + 1)]
    page_ok = all(
        r["totals"] == baseline["totals"] and r["total"] == total for r in by_page
    )
    # Các trang phải thực sự trả dòng khác nhau, nếu không "bất biến" là vô nghĩa.
    ids = [tuple(row["id"] for row in r["data"]) for r in by_page]
    distinct = len({i for page in ids for i in page}) == total

    if not (limit_ok and page_ok and distinct):
        failures += 1
    amount = baseline["totals"]["totalAmount"]
    print(
        f"| {label} | {total} dòng / {amount:,.0f}".replace(",", ".")
        + f" | {'✅ cùng totals' if limit_ok else '❌ LỆCH'}"
        + f" | {'✅ ' + str(pages) + ' trang, cùng totals, dòng không trùng' if page_ok and distinct else '❌ LỆCH'} |"
    )

raise SystemExit(1 if failures else 0)
