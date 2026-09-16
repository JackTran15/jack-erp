"""T-02-03 extra: one of an owner's files fails (quota boundary at 99) ⇒ owner NOT attached,
sibling card explains, old image set intact. Seed rows removed afterwards."""
import json, os, struct, subprocess, zlib
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path("/Users/akenzy/Documents/work/erp/be/erp3")
OUT = Path(__file__).parent / ".out" / "t0203b"; OUT.mkdir(parents=True, exist_ok=True)
ADMIN = "f1000000-0000-4000-8000-000000000031"; ORG = "f1000000-0000-4000-8000-000000000001"
A_ID = "0305db48-983a-43d5-a0f8-eca771444836"

def psql(sql):
    env = dict(os.environ, PGPASSWORD=os.environ["DB_PASS"])
    return subprocess.run(["psql", "-h", "localhost", "-p", "5433", "-U", "erp_user", "-d", "erp_dev", "-At", "-F", " | ", "-c", sql],
                          env=env, capture_output=True, text=True, check=True).stdout.strip()

def png(path, seed=0):
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + bytes([seed % 256, (seed * 7) % 256, (seed * 13) % 256] * 2) for _ in range(2))
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 2, 2, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))
    return path

two = [png(OUT / "AAA-MEDIA-A (01).png", 41), png(OUT / "AAA-MEDIA-A (02).png", 42)]
before = psql(f"SELECT string_agg(id::text, ',' ORDER BY sort_order) FROM media_objects WHERE owner_id='{A_ID}' AND status='ATTACHED'")
current = int(psql(f"SELECT COUNT(*) FROM media_objects WHERE status<>'ATTACHED' AND created_at >= now()-interval '24 hours' AND created_by='{ADMIN}'"))
seed = 0
psql(f"""INSERT INTO media_objects (id, organization_id, owner_type, owner_id, status, bucket, object_key, file_name, content_type, size_bytes, sort_order, created_by, created_at, updated_at)
        SELECT gen_random_uuid(), '{ORG}', 'ITEM', NULL, 'UPLOADED', 'erp-media-public', 'org/{ORG}/item/quota-seed-b-' || g, 'QUOTA-SEED.png', 'image/png', 10, 0, '{ADMIN}', now(), now()
        FROM generate_series(1, {seed}) g""")
obs = {"seeded": seed, "unattached_now": psql(f"SELECT COUNT(*) FROM media_objects WHERE status<>'ATTACHED' AND created_at >= now()-interval '24 hours' AND created_by='{ADMIN}'")}
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(storage_state=str(ROOT / ".ai/.auth/local-backoffice.json"), viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        net = {"uploads": 0, "storage": 0, "set_images": 0}
        def on_req(req):
            u = req.url
            if req.method != "POST": return
            if "/media/uploads" in u and not u.endswith("/complete"): net["uploads"] += 1
            elif "/erp-media-public" in u: net["storage"] += 1
            elif "/inventory/items/set-images" in u: net["set_images"] += 1
        page.on("request", on_req)
        aborted = {"n": 0}
        def gate(route):
            if route.request.method == "POST" and aborted["n"] == 0:
                aborted["n"] += 1; route.abort("failed")
            else:
                route.continue_()
        page.route("**/erp-media-public*", gate)
        page.goto("http://localhost:3000/admin/inventory-items/images/quick")
        page.wait_for_selector("text=Kéo thả ảnh vào đây hoặc bấm Chọn ảnh", timeout=30000)
        page.locator('input[type="file"][multiple]').set_input_files([str(f) for f in two])
        page.wait_for_function("() => !document.body.innerText.includes('Đang kiểm tra')", timeout=30000)
        page.locator('button:has-text("Cập nhật")').last.click()
        page.wait_for_function("() => !document.body.innerText.includes('Đang cập nhật')", timeout=120000)
        page.wait_for_timeout(500)
        obs["net"] = dict(net)
        obs["quota_cards"] = page.locator("text=Hết hạn mức tải lên trong ngày").count()
        obs["sibling_cards"] = page.locator("text=Không gắn vì file khác của mẫu mã lỗi").count()
        obs["done_cards"] = page.locator("text=Đã cập nhật").count()
        obs["aborted_storage_posts"] = aborted["n"]
        obs["failed_upload_cards"] = page.locator("text=Tải ảnh thất bại, thử lại").count()
        page.screenshot(path=str(OUT / "01-partial-owner.png"), full_page=True)
        browser.close()
finally:
    psql("DELETE FROM media_objects WHERE file_name='QUOTA-SEED.png'")
after = psql(f"SELECT string_agg(id::text, ',' ORDER BY sort_order) FROM media_objects WHERE owner_id='{A_ID}' AND status='ATTACHED'")
obs["A_unchanged"] = (before == after)
obs["A_attached_now"] = psql(f"SELECT string_agg(file_name || '@' || sort_order, ', ' ORDER BY sort_order) FROM media_objects WHERE owner_id='{A_ID}' AND status='ATTACHED'")
print(json.dumps(obs, ensure_ascii=False, indent=1))
