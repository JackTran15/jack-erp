#!/usr/bin/env python3
"""
Fixtures for 07-verification.md — media-storage.

The ai-dlc-verify runner knows four verbs (click / fill / wait / scroll) and cannot pick a
file, so every upload is done here through the SAME presigned-POST flow the browser uses
(POST /media/uploads → multipart POST straight to storage with no ERP header →
POST /media/uploads/:id/complete), then attached to its owner through the owner's own
endpoint. The runner then verifies the read side in the browser.

    python3 .ai/features/2026091301-media-storage/verify-fixtures.py            # seed what is missing
    python3 .ai/features/2026091301-media-storage/verify-fixtures.py --reset    # re-attach 3 images to A (after S17/S18)
    python3 .ai/features/2026091301-media-storage/verify-fixtures.py --check    # API-only checks → evidence/api-checks.json

Reads .ai/credentials.env (LOCAL_BACKOFFICE_*); never prints a credential. Writes only to
the local DB the API on :4000 is using (erp_dev when started with DB_NAME=erp_dev) and to
local MinIO. Stdlib only.
"""
import datetime
import hashlib
import json
import mimetypes
import os
import struct
import sys
import urllib.error
import urllib.request
import uuid
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
HERE = os.path.dirname(os.path.abspath(__file__))
FX = os.path.join(HERE, "evidence", "fixtures")
API = "http://localhost:4000"

ORG = "f1000000-0000-4000-8000-000000000001"          # My Company (org-baseline seed)
HCM = "c3bf1922-3a2e-42d9-b00d-a7129efe592c"          # Hồ Chí Minh
HN = "09743ddb-4db6-4926-9a79-9921e7f7fd55"           # Hà Nội
EMPLOYEE_WITH_PHOTO = "ffb49dfa-ceab-406d-9e93-6d37db6200b8"   # staff-hcm@erp.local, NV000001
# Voucher plumbing copied from existing HCM documents in erp_dev (see 07-verification.md).
CASH_ACCOUNT = "c387b670-b2a9-4a87-8201-425b3dd4a147"
CONTRA_ACCOUNT = "3329d3a4-81ed-4d2b-af58-55a23a1cede2"
DEPOSIT_ACCOUNT = "2dbd34ec-1474-4479-ab27-05ffa088bd89"
DEPOSIT_CONTRA = "af867dc9-ce55-4ba9-bd88-ec04a2457433"
PROVIDER = "7d81f35f-762b-4a4c-8809-3ae4e2ace978"
LOCATION = "6b30da50-9027-4196-9b0d-2f7abcfe0e97"
SRC_STORAGE, DST_STORAGE = "a50db520-408a-40ae-98b3-6ad37bd58b4b", "676d5645-04d6-4d69-9399-ed4a1555d483"
DST_LOCATION = "0b9c7d31-7de2-4e81-98d0-4417049a8375"
STOCKED_ITEM = "230aaa9e-cdee-4cc3-94a7-d97ee7432462"  # item used by CK000016; has stock at SRC_STORAGE
REASON = "AIDLC media-storage"  # every seeded voucher carries this prefix so it can be found again


# ----------------------------------------------------------------------------- files
def _png(path, w, h, rgb):
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    r, g, b = rgb
    shades = [(r, g, b), (r // 2, g // 2, b // 2), (min(255, r + 60), min(255, g + 60), min(255, b + 60))]
    raw = b"".join(b"\x00" + bytes(shades[(y * 3 // h) % 3]) * w for y in range(h))
    data = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 0)) + chunk(b"IEND", b""))
    open(path, "wb").write(data)


def _pdf(path, title, pad):
    content = f"BT /F1 24 Tf 72 760 Td ({title}) Tj ET".encode("latin-1", "replace")
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
            b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream",
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
            b"<< /Length %d >>\nstream\n" % pad + b"0" * pad + b"\nendstream"]
    out, offsets = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"), []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out)); out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs)+1}\n0000000000 65535 f \n".encode() + b"".join(f"{o:010d} 00000 n \n".encode() for o in offsets)
    out += f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    open(path, "wb").write(bytes(out))


MiB = 1024 * 1024
FILES = {
    "nhan-vien-hcm.png": lambda p: _png(p, 600, 580, (40, 120, 200)),        # ~1 MB, EMPLOYEE_PROFILE (limit 5 MB)
    "anh-a-1.png": lambda p: _png(p, 320, 320, (220, 60, 60)),               # ~300 KB, PRODUCT (limit 2 MB)
    "anh-a-2.png": lambda p: _png(p, 320, 320, (60, 180, 90)),
    "anh-a-3.png": lambda p: _png(p, 320, 320, (240, 180, 40)),
    "anh-b.png": lambda p: _png(p, 320, 320, (120, 80, 200)),                # ITEM
    "hop-dong-nhap-kho.pdf": lambda p: _pdf(p, "Hop dong nhap kho - AIDLC media-storage", 3 * MiB),  # AC-13: ~3 MB
    "lenh-chuyen-kho.pdf": lambda p: _pdf(p, "Lenh chuyen kho - AIDLC media-storage", 200_000),
    "phieu-chuyen-kho.pdf": lambda p: _pdf(p, "Phieu chuyen kho - AIDLC media-storage", 200_000),
    "bien-lai-thu.png": lambda p: _png(p, 400, 300, (30, 150, 150)),
    "bien-lai-thu-da-dao.png": lambda p: _png(p, 400, 300, (150, 30, 90)),
    "chung-tu-chi.pdf": lambda p: _pdf(p, "Chung tu chi - AIDLC media-storage", 200_000),
    "giay-bao-co.pdf": lambda p: _pdf(p, "Giay bao co - AIDLC media-storage", 200_000),
    "uy-nhiem-chi.pdf": lambda p: _pdf(p, "Uy nhiem chi - AIDLC media-storage", 200_000),
}


def ensure_files():
    os.makedirs(FX, exist_ok=True)
    for name, make in FILES.items():
        p = os.path.join(FX, name)
        if not os.path.exists(p):
            make(p)


# ----------------------------------------------------------------------------- api
def creds():
    v = {}
    for line in open(os.path.join(ROOT, ".ai", "credentials.env"), encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, val = line.split("=", 1); v[k.strip()] = val.strip().strip('"')
    return v


class Api:
    def __init__(self):
        c = creds()
        r = self._raw("POST", "/auth/login", {"organizationId": c["LOCAL_BACKOFFICE_ORG_ID"],
                                              "email": c["LOCAL_BACKOFFICE_EMAIL"],
                                              "password": c["LOCAL_BACKOFFICE_PASSWORD"]}, {})
        self.token, self.branch_id = r["accessToken"], None
        r = self._raw("POST", "/auth/switch-branch", {"branchId": HCM}, self.headers())
        self.token, self.branch_id = r.get("accessToken", self.token), HCM

    def _raw(self, method, path, body, headers):
        req = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None,
                                     method=method, headers={"Content-Type": "application/json", **headers})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                txt = resp.read()
                return json.loads(txt) if txt else None
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"{method} {path} -> {e.code}: {e.read().decode(errors='replace')[:400]}") from None

    def headers(self, idem=True):
        h = {"Authorization": f"Bearer {self.token}"}
        if self.branch_id:
            h["X-Branch-Id"] = self.branch_id
        if idem:
            h["X-Idempotency-Key"] = str(uuid.uuid4())
        return h

    def get(self, path): return self._raw("GET", path, None, self.headers(idem=False))
    def post(self, path, body): return self._raw("POST", path, body, self.headers())
    def patch(self, path, body): return self._raw("PATCH", path, body, self.headers())

    def upload(self, owner_type, name):
        """Ticket → multipart POST to storage (no Authorization / X-Branch-Id / X-Idempotency-Key) → complete."""
        data = open(os.path.join(FX, name), "rb").read()
        ctype = mimetypes.guess_type(name)[0]
        t = self.post("/media/uploads", {"ownerType": owner_type, "fileName": name, "contentType": ctype, "size": len(data)})
        boundary = "----aidlc" + uuid.uuid4().hex
        parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
                 for k, v in t["upload"]["fields"].items()]
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\n'
                     f'Content-Type: {ctype}\r\n\r\n'.encode() + data + b"\r\n" + f"--{boundary}--\r\n".encode())
        req = urllib.request.Request(t["upload"]["url"], data=b"".join(parts), method="POST",
                                     headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            assert resp.status in (200, 201, 204), resp.status
        self.post(f"/media/uploads/{t['mediaId']}/complete", {})
        return t["mediaId"]


def rows(r):
    return r.get("data") if isinstance(r, dict) else r


# ----------------------------------------------------------------------------- seed
def seed(api, reset_images=False):
    out = {}
    # AC-09 — employee photo on NV000001 (staff-hcm). NV000002 stays without a photo for AC-11.
    prof = api.get(f"/admin/users/{EMPLOYEE_WITH_PHOTO}")["profile"]
    if not prof.get("photoMediaId"):
        api.patch(f"/admin/users/{EMPLOYEE_WITH_PHOTO}", {"profile": {"code": prof["code"],
                  "photoMediaId": api.upload("EMPLOYEE_PROFILE", "nhan-vien-hcm.png")}})
        prof = api.get(f"/admin/users/{EMPLOYEE_WITH_PHOTO}")["profile"]
    out["employee"] = {"code": prof["code"], "photoMediaId": prof["photoMediaId"], "photoUrl": prof["photoUrl"].split("?")[0]}

    # AC-01 / AC-04 / AC-05 — items. A = product with colours/sizes (PRODUCT, 3 images),
    # B = single item (ITEM, 1 image, A-25), C = no image.
    existing = {r["code"]: r for r in rows(api.get("/admin/entities/inventory-items/records?search=AAA-MEDIA&pageSize=20")) if r.get("code")}
    if "AAA-MEDIA-A" not in existing:
        ids = [api.upload("PRODUCT", f"anh-a-{i}.png") for i in (1, 2, 3)]
        r = api.post("/admin/entities/inventory-items/records", {"code": "AAA-MEDIA-A", "name": "AIDLC media A (có màu/size)", "unit": "Đôi",
                     "purchasePrice": 100000, "sellingPrice": 200000, "colors": ["Đen", "Trắng"], "sizes": ["39", "40"], "imageIds": ids})
        a_id = r["productId"]
    else:
        a_id = existing["AAA-MEDIA-A"].get("productId") or existing["AAA-MEDIA-A"]["id"]
        if reset_images:
            ids = [api.upload("PRODUCT", f"anh-a-{i}.png") for i in (1, 2, 3)]
            api.patch(f"/admin/entities/inventory-items/records/{a_id}", {"imageIds": ids})
    a = api.get(f"/admin/entities/inventory-items/records/{a_id}")
    out["product_A"] = {"id": a_id, "images": [(i["fileName"], i["url"]) for i in a["images"]]}
    if "AAA-MEDIA-B" not in existing:
        r = api.post("/admin/entities/inventory-items/records", {"code": "AAA-MEDIA-B", "name": "AIDLC media B (không biến thể)", "unit": "Cái",
                     "purchasePrice": 50000, "sellingPrice": 90000, "imageIds": [api.upload("ITEM", "anh-b.png")]})
        b_id = r["id"]
    else:
        b_id = existing["AAA-MEDIA-B"]["id"]
    out["item_B"] = {"id": b_id, "images": [(i["fileName"], i["url"]) for i in api.get(f"/admin/entities/inventory-items/records/{b_id}")["images"]]}
    if "AAA-MEDIA-C" not in existing:
        r = api.post("/admin/entities/inventory-items/records", {"code": "AAA-MEDIA-C", "name": "AIDLC media C (không ảnh)", "unit": "Cái",
                     "purchasePrice": 10000, "sellingPrice": 15000})
        c_id = r["id"]
    else:
        c_id = existing["AAA-MEDIA-C"]["id"]
    out["item_C"] = {"id": c_id}

    # AC-13 / AC-14 / AC-16 — one voucher per owner type, dated today so the list pages'
    # default "this month / this week" filter shows them. Found again by REASON.
    today = datetime.date.today().isoformat()
    now = datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")

    this_week = datetime.date.today().isocalendar()[:2]

    def find(path, field, needle):
        # Exact match on the seeded reason, originals only: a reversal entry copies the
        # original's reason (referenceType REVERSAL) and must never be picked up here.
        # Only this ISO week's fixtures count — the list pages default to "this week"
        # (transfer orders) / "this month", and a fixture the runner cannot see is no fixture.
        for r in rows(api.get(f"{path}?pageSize=50")):
            created = datetime.date.fromisoformat((r.get("createdAt") or "")[:10]) if r.get("createdAt") else None
            if ((r.get(field) or "") == needle and (r.get("referenceType") or "MANUAL") == "MANUAL"
                    and created and created.isocalendar()[:2] == this_week):
                return r
        return None

    def voucher(key, path, body, field="reason", needle=None):
        r = find(path, field, needle or REASON + ": " + key)
        if not r:
            r = api.post(path, body())
        out[key] = {"documentNumber": r["documentNumber"], "id": r["id"], "status": r["status"]}
        return r

    voucher("cash_receipt", "/cash-receipts", lambda: {"voucherDate": today, "cashAccountId": CASH_ACCOUNT, "contraAccountId": CONTRA_ACCOUNT,
            "totalAmount": 500000, "reason": f"{REASON}: cash_receipt", "lines": [{"description": "Thu tiền (fixture verify)", "amount": 500000}],
            "attachmentIds": [api.upload("CASH_RECEIPT", "bien-lai-thu.png")]})
    rev = voucher("cash_receipt_reversed", "/cash-receipts", lambda: {"voucherDate": today, "cashAccountId": CASH_ACCOUNT, "contraAccountId": CONTRA_ACCOUNT,
            "totalAmount": 250000, "reason": f"{REASON}: cash_receipt_reversed", "lines": [{"description": "Thu tiền (fixture verify, đảo)", "amount": 250000}],
            "attachmentIds": [api.upload("CASH_RECEIPT", "bien-lai-thu-da-dao.png")]})
    if rev["status"] != "REVERSED":
        api.post(f"/cash-receipts/{rev['id']}/reverse", {"reason": f"{REASON}: đảo để kiểm AC-16"})
        out["cash_receipt_reversed"]["status"] = "REVERSED"
    voucher("cash_payment", "/cash-payments", lambda: {"voucherDate": today, "cashAccountId": CASH_ACCOUNT, "contraAccountId": CONTRA_ACCOUNT,
            "totalAmount": 300000, "reason": f"{REASON}: cash_payment", "lines": [{"description": "Chi tiền (fixture verify)", "amount": 300000}],
            "attachmentIds": [api.upload("CASH_PAYMENT", "chung-tu-chi.pdf")]})
    voucher("bank_receipt", "/bank-receipts", lambda: {"depositAccountId": DEPOSIT_ACCOUNT, "docDate": today, "contraAccountId": DEPOSIT_CONTRA,
            "totalAmount": 700000, "reason": f"{REASON}: bank_receipt", "lines": [{"description": "Thu ngân hàng (fixture verify)", "amount": 700000}],
            "attachmentIds": [api.upload("BANK_RECEIPT", "giay-bao-co.pdf")]})
    voucher("bank_payment", "/bank-payments", lambda: {"depositAccountId": DEPOSIT_ACCOUNT, "docDate": today, "contraAccountId": CONTRA_ACCOUNT,
            "totalAmount": 400000, "reason": f"{REASON}: bank_payment", "lines": [{"description": "Chi ngân hàng (fixture verify)", "amount": 400000}],
            "attachmentIds": [api.upload("BANK_PAYMENT", "uy-nhiem-chi.pdf")]})
    # Goods receipt: POST /goods-receipts is createAndPost (the v2 draft endpoint 500s, see UOW-04 risks);
    # purpose PURCHASE because OTHER needs goods_receipt.other-receipt, which the seed admin lacks.
    voucher("goods_receipt", "/goods-receipts", lambda: {"purpose": "PURCHASE", "providerId": PROVIDER, "receivedAt": now, "locationId": LOCATION,
            "description": f"{REASON}: goods_receipt", "lines": [{"itemId": c_id, "locationId": LOCATION, "uomCode": "Cái", "quantity": 1, "unitPrice": 10000}],
            "attachmentIds": [api.upload("GOODS_RECEIPT", "hop-dong-nhap-kho.pdf")]}, field="description")
    voucher("transfer_order", "/inventory/transfer-orders", lambda: {"sourceBranchId": HCM, "destinationBranchId": HN, "notes": f"{REASON}: transfer_order",
            "lines": [{"itemId": STOCKED_ITEM, "requestedQty": 1}], "attachmentIds": [api.upload("TRANSFER_ORDER", "lenh-chuyen-kho.pdf")]}, field="notes")
    voucher("stock_transfer", "/inventory/stock/transfers", lambda: {"notes": f"{REASON}: stock_transfer",
            "lines": [{"itemId": STOCKED_ITEM, "quantity": 1, "sourceStorageId": SRC_STORAGE, "destinationStorageId": DST_STORAGE,
                       "sourceLocationId": LOCATION, "destinationLocationId": DST_LOCATION}],
            "attachmentIds": [api.upload("STOCK_TRANSFER", "phieu-chuyen-kho.pdf")]}, field="notes")
    return out


# ----------------------------------------------------------------------------- checks
def fetch(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, e.read()


def xml_code(b):
    return b.decode(errors="replace").split("<Code>")[1].split("</Code>")[0] if b"<Code>" in b else None


def check(api, fx):
    """The AC halves the browser cannot show: headers, bytes, API payloads. Plain urllib, no ERP header."""
    c = {"at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    gr = api.get(f"/goods-receipts/{fx['goods_receipt']['id']}")
    att = gr["attachments"][0]
    dl = api.get(f"/media/{att['id']}/download-url")
    st, h, body = fetch(dl["url"])
    src = open(os.path.join(FX, "hop-dong-nhap-kho.pdf"), "rb").read()
    c["AC-13"] = {"voucher": gr["documentNumber"], "attachment": {k: att[k] for k in ("fileName", "contentType", "size")},
                  "download_status": st, "content_disposition": h.get("content-disposition"), "content_type": h.get("content-type"),
                  "size_match": len(body) == len(src), "sha256_match": hashlib.sha256(body).hexdigest() == hashlib.sha256(src).hexdigest(),
                  "expiresAt": dl.get("expiresAt")}
    st, _, b = fetch(dl["url"][:-6] + "000000")
    c["AC-15-tampered-signature"] = {"status": st, "code": xml_code(b)}
    signed = api.get(f"/admin/users/{EMPLOYEE_WITH_PHOTO}")["profile"]["photoUrl"]
    s1, _, b1 = fetch(signed.split("?")[0]); s2, h2, _ = fetch(signed)
    c["AC-10"] = {"bare_status": s1, "bare_code": xml_code(b1), "signed_status": s2, "signed_content_type": h2.get("content-type")}
    pub = fx["product_A"]["images"][0][1]
    s3, h3, b3 = fetch(pub)
    c["AC-07"] = {"url": pub, "has_query": "?" in pub, "status": s3, "content_type": h3.get("content-type"),
                  "cache_control": h3.get("cache-control"), "bytes_match_fixture": b3 == open(os.path.join(FX, fx["product_A"]["images"][0][0]), "rb").read()}
    cat = rows(api.get(f"/pos/branches/{HCM}/catalog/products?search=AIDLC&pageSize=50"))
    c["AC-05"] = {"query": "GET /pos/branches/{HCM}/catalog/products?search=AIDLC",
                  "rows": [{"name": r.get("name"), "variantCount": r.get("variantCount"), "imageUrl": r.get("imageUrl")} for r in cat]}
    c["AC-06"] = ("not run: the verify account lacks api-key.create, so no X-Api-Key can be issued from here; "
                  "covered by search-partner-products.handler.spec / get-partner-product.handler.spec (UOW-03 DoD)")
    return c


if __name__ == "__main__":
    ensure_files()
    api = Api()
    fx = seed(api, reset_images="--reset" in sys.argv)
    print(json.dumps(fx, ensure_ascii=False, indent=1))
    if "--check" in sys.argv:
        c = check(api, fx)
        p = os.path.join(HERE, "evidence", "api-checks.json")
        json.dump(c, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(json.dumps(c, ensure_ascii=False, indent=1))
        print("written", os.path.relpath(p, ROOT))
