"""T-02-03 browser check with the saved backoffice session:
 AC-13  six-file run → A gets (01),(02),variant in order; B gets 1; 4 uploads; one set-images per owner
 AC-14  quota exhausted (100 seeded UPLOADED rows) → cards fail with the quota message, button re-enabled;
        seed removed → second click succeeds
 AC-17  Quay lại during a run → confirm dialog → abort + navigate
Resets C to zero images at the end (A/B keep the new sets; media-storage's --reset can restore theirs)."""
import json, os, struct, subprocess, time, zlib
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path("/Users/akenzy/Documents/work/erp/be/erp3")
OUT = Path(__file__).parent / ".out" / "t0203"
OUT.mkdir(parents=True, exist_ok=True)
C_ID = "7fa5daba-f56f-439b-b9fe-2dc30e6f5e34"
ADMIN = "f1000000-0000-4000-8000-000000000031"
ORG = "f1000000-0000-4000-8000-000000000001"


def psql(sql):
    env = dict(os.environ, PGPASSWORD=os.environ["DB_PASS"])
    return subprocess.run(["psql", "-h", "localhost", "-p", "5433", "-U", "erp_user", "-d", "erp_dev", "-At", "-F", " | ", "-c", sql],
                          env=env, capture_output=True, text=True, check=True).stdout.strip()


def png(path, size_bytes=None, seed=0):
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + bytes([seed % 256, (seed * 7) % 256, (seed * 13) % 256] * 2) for _ in range(2))
    body = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 2, 2, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw))
    if size_bytes and size_bytes > len(body) + 24:
        body += chunk(b"prVt", os.urandom(size_bytes - len(body) - 24))
    body += chunk(b"IEND", b"")
    path.write_bytes(body)
    return path


six = [
    png(OUT / "AAA-MEDIA-A (01).png", seed=1), png(OUT / "AAA-MEDIA-A (02).png", seed=2),
    png(OUT / "AAA-MEDIA-B.png", seed=3), png(OUT / "aaamed-39-đen.png", seed=4),
    png(OUT / "KHONG-CO.png", seed=5), png(OUT / "to-3mb.png", 3 * 1024 * 1024),
]
quota_two = [png(OUT / "q" / "AAA-MEDIA-B.png", seed=8), png(OUT / "q" / "AAA-MEDIA-C.png", seed=9)] if (OUT / "q").mkdir(exist_ok=True) is None else []
eight = [png(OUT / "a8" / f"AAA-MEDIA-A ({i:02d}).png", 1024 * 1024, seed=30 + i) for i in range(1, 9)] if (OUT / "a8").mkdir(exist_ok=True) is None else []

obs = {}
with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(storage_state=str(ROOT / ".ai/.auth/local-backoffice.json"), viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    net = {"uploads": 0, "storage": 0, "set_images": 0}
    inflight = {"uploads": 0, "storage": 0}; peak = {"uploads": 0, "storage": 0}
    set_images_bodies = []

    def classify(req):
        u = req.url
        if req.method != "POST": return None
        if "/media/uploads" in u and not u.endswith("/complete"): return "uploads"
        if "/erp-media-public" in u or ":9000" in u: return "storage"
        if "/inventory/items/set-images" in u: return "set_images"
        return None

    def on_req(req):
        k = classify(req)
        if not k: return
        net[k] += 1
        if k == "set_images":
            try: set_images_bodies.append(json.loads(req.post_data or "{}"))
            except Exception: pass
        if k in inflight:
            inflight[k] += 1; peak[k] = max(peak[k], inflight[k])

    def on_done(req):
        k = classify(req)
        if k in inflight: inflight[k] -= 1
    page.on("request", on_req); page.on("requestfinished", on_done); page.on("requestfailed", on_done)

    OBSERVER = """window.__toasts = []; new MutationObserver((muts) => { for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue; const el = n.matches?.('[data-sonner-toast]') ? n : n.querySelector?.('[data-sonner-toast]');
        if (el) setTimeout(() => window.__toasts.push(el.innerText), 50); } }).observe(document.body, { childList: true, subtree: true });"""
    seen = {"n": 0}
    def install(): page.evaluate(OBSERVER); seen["n"] = 0
    def toast(timeout=60000):
        page.wait_for_function("(n) => window.__toasts.length > n", arg=seen["n"], timeout=timeout)
        t = page.evaluate("window.__toasts"); seen["n"] = len(t); return t[-1]
    def header(): return page.locator("h1").first.inner_text().replace("\n", " ").strip()
    def reset_net():
        for k in net: net[k] = 0
        for k in peak: peak[k] = 0
        set_images_bodies.clear()
    def open_quick():
        page.goto("http://localhost:3000/admin/inventory-items/images/quick")
        page.wait_for_selector("text=Kéo thả ảnh vào đây hoặc bấm Chọn ảnh", timeout=30000); install()
    def wait_idle():
        page.wait_for_function("() => !document.body.innerText.includes('Đang kiểm tra') && !document.body.innerText.includes('Đang cập nhật')", timeout=120000)

    # ── AC-13 ──
    open_quick()
    picker = page.locator('input[type="file"][multiple]')
    picker.set_input_files([str(f) for f in six]); wait_idle()
    obs["ac13_header_before"] = header()
    reset_net(); page.locator('button:has-text("Cập nhật")').last.click()
    obs["ac13_toast"] = toast(120000); wait_idle()
    obs["ac13_header_after"] = header()
    obs["ac13_net"] = dict(net); obs["ac13_peak"] = dict(peak)
    obs["ac13_set_images_bodies"] = set_images_bodies[:]
    obs["ac13_done_cards"] = page.locator("text=Đã cập nhật").count()
    obs["ac13_button_disabled"] = page.locator('button:has-text("Cập nhật")').last.is_disabled()
    page.screenshot(path=str(OUT / "01-ac13.png"), full_page=True)
    obs["ac13_db_A"] = psql(f"SELECT string_agg(file_name || '@' || sort_order, ', ' ORDER BY sort_order) FROM media_objects WHERE owner_id='0305db48-983a-43d5-a0f8-eca771444836' AND status='ATTACHED'")
    obs["ac13_db_A_deleted_recent"] = psql("SELECT COUNT(*) FROM media_objects WHERE owner_id='0305db48-983a-43d5-a0f8-eca771444836' AND status='DELETED' AND deleted_at > now()-interval '5 minutes'")
    obs["ac13_db_B"] = psql("SELECT string_agg(file_name || '@' || sort_order, ', ' ORDER BY sort_order) FROM media_objects WHERE owner_id='b386822a-e432-4af7-808c-42f8c7df84b4' AND status='ATTACHED'")

    # ── AC-14 ── seed the quota, run, remove the seed, run again
    psql(f"""INSERT INTO media_objects (id, organization_id, owner_type, owner_id, status, bucket, object_key, file_name, content_type, size_bytes, sort_order, created_by, created_at, updated_at)
             SELECT gen_random_uuid(), '{ORG}', 'ITEM', NULL, 'UPLOADED', 'erp-media-public', 'org/{ORG}/item/quota-seed-' || g, 'QUOTA-SEED.png', 'image/png', 10, 0, '{ADMIN}', now(), now()
             FROM generate_series(1, 100) g""")
    obs["ac14_unattached_after_seed"] = psql(f"SELECT COUNT(*) FROM media_objects WHERE status<>'ATTACHED' AND created_at >= now()-interval '24 hours' AND created_by='{ADMIN}'")
    open_quick()
    page.locator('input[type="file"][multiple]').set_input_files([str(f) for f in quota_two]); wait_idle()
    reset_net(); page.locator('button:has-text("Cập nhật")').last.click()
    obs["ac14_toast_quota"] = toast(120000); wait_idle()
    obs["ac14_quota_cards"] = page.locator("text=Hết hạn mức tải lên trong ngày").count()
    obs["ac14_net_quota"] = dict(net)
    obs["ac14_button_reenabled"] = not page.locator('button:has-text("Cập nhật")').last.is_disabled()
    page.screenshot(path=str(OUT / "02-ac14-quota.png"), full_page=True)
    psql("DELETE FROM media_objects WHERE file_name='QUOTA-SEED.png'")
    reset_net(); page.locator('button:has-text("Cập nhật")').last.click()
    obs["ac14_toast_retry"] = toast(120000); wait_idle()
    obs["ac14_net_retry"] = dict(net)
    obs["ac14_done_cards"] = page.locator("text=Đã cập nhật").count()
    obs["ac14_db_C"] = psql(f"SELECT COUNT(*) FROM media_objects WHERE owner_id='{C_ID}' AND status='ATTACHED'")
    page.screenshot(path=str(OUT / "03-ac14-retry.png"), full_page=True)

    # ── AC-17 ── leave during a run
    open_quick()
    page.locator('input[type="file"][multiple]').set_input_files([str(f) for f in eight]); wait_idle()
    reset_net(); page.locator('button:has-text("Cập nhật")').last.click()
    page.wait_for_selector("text=Đang cập nhật", timeout=15000)
    page.locator('button:has-text("Quay lại")').click()
    dlg = page.locator('[role="dialog"]'); dlg.wait_for(timeout=10000)
    obs["ac17_dialog"] = dlg.inner_text().replace("\n", " | ")
    page.screenshot(path=str(OUT / "04-ac17-dialog.png"))
    dlg.locator('button:has-text("Rời trang")').click()
    page.wait_for_selector('button:has-text("In tem mã")', timeout=15000)
    obs["ac17_left_to_list"] = True
    obs["ac17_net_at_leave"] = dict(net)

    # ── reset C to zero images via the edit form (fixture) ──
    page.goto(f"http://localhost:3000/admin/inventory-items/{C_ID}/edit")
    page.wait_for_selector('#create-code[value="AAA-MEDIA-C"]', timeout=30000)
    page.wait_for_selector('img[src*="/erp-media-public/"]', timeout=30000); install()
    while page.locator('button[aria-label="Xóa ảnh"]').count():
        page.locator('button[aria-label="Xóa ảnh"]').first.click()
    page.locator('text="Lưu"').click(); obs["reset_C_toast"] = toast()
    obs["reset_C_db"] = psql(f"SELECT COUNT(*) FROM media_objects WHERE owner_id='{C_ID}' AND status='ATTACHED'")
    browser.close()

print(json.dumps(obs, ensure_ascii=False, indent=1))
