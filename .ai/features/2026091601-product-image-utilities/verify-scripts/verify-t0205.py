"""T-02-05 browser check with the saved backoffice session (ADR-04 amended: 3 workers over the whole run).
Local MinIO answers in ~1 ms, so elapsed time is API-latency bound either way — peak in-flight is the metric.
(A blocking `page.route` sleep serialises Playwright's own event loop, so it must not be used while measuring.)
 S1  six one-file products → Cập nhật ⇒ peak in-flight POST /media/uploads == 3 across owners
     (old runner: 1 — one owner at a time), one set-images per owner, 6 cards done, ≈ 2 rounds not 6
 S1b A (01)(02)(03) + two one-file products ⇒ A's set-images carries 3 ids in seq order and is sent
     only after A's three /complete requests; peak still ≤ 3
 S2  eight 1.9 MB files for A with storage POSTs slowed to 1 s → Quay lại → dialog → Rời trang ⇒ no
     set-images for A
Run as `verify-t0205.py <label>`; output under .out/t0205-<label>/. Resets the one-file products to
zero images at the end (A keeps its new set, like verify-t0203)."""
import json, os, struct, subprocess, sys, time, zlib
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path("/Users/akenzy/Documents/work/erp/be/erp3")
LABEL = sys.argv[1] if len(sys.argv) > 1 else "new"
OUT = Path(__file__).parent / ".out" / f"t0205-{LABEL}"
OUT.mkdir(parents=True, exist_ok=True)
A_ID = "0305db48-983a-43d5-a0f8-eca771444836"
SINGLES = ["ABA2777", "ABA2799", "ABA2813", "ABA2950", "ABA3026", "ABA3299"]


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


for d in ("s1", "s1b", "s2"): (OUT / d).mkdir(exist_ok=True)
six = [png(OUT / "s1" / f"{code}.png", 300 * 1024, seed=10 + i) for i, code in enumerate(SINGLES)]
five = [png(OUT / "s1b" / f"AAA-MEDIA-A ({i:02d}).png", 300 * 1024, seed=i) for i in (1, 2, 3)] + \
       [png(OUT / "s1b" / f"{code}.png", 300 * 1024, seed=20 + i) for i, code in enumerate(SINGLES[:2])]
eight = [png(OUT / "s2" / f"AAA-MEDIA-A ({i:02d}).png", 1900 * 1024, seed=30 + i) for i in range(1, 9)]

single_ids = psql("SELECT string_agg(id::text, ',') FROM products WHERE code = ANY(ARRAY['" + "','".join(SINGLES) + "'])").split(",")
started_at = psql("SELECT now()")

obs = {"label": LABEL}
with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(storage_state=str(ROOT / ".ai/.auth/local-backoffice.json"), viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    net = {"uploads": 0, "storage": 0, "complete": 0, "set_images": 0}
    inflight = {"uploads": 0, "storage": 0}; peak = {"uploads": 0, "storage": 0}
    set_images = []          # (t, body)
    complete_sent = {}       # mediaId -> t (request sent)
    timeline = []            # (t, event)

    def classify(req):
        u = req.url
        if req.method != "POST": return None
        if u.endswith("/complete") and "/media/uploads/" in u: return "complete"
        if "/media/uploads" in u: return "uploads"
        if "/erp-media-public" in u or ":9000" in u: return "storage"
        if "/inventory/items/set-images" in u: return "set_images"
        return None

    def on_req(req):
        k = classify(req)
        if not k: return
        t = time.monotonic(); net[k] += 1; timeline.append((round(t, 3), f"→ {k}"))
        if k == "set_images":
            try: set_images.append((t, json.loads(req.post_data or "{}")))
            except Exception: pass
        if k == "complete": complete_sent[req.url.rsplit("/", 2)[-2]] = t
        if k in inflight:
            inflight[k] += 1; peak[k] = max(peak[k], inflight[k])

    def on_done(req):
        k = classify(req)
        if not k: return
        t = time.monotonic(); timeline.append((round(t, 3), f"✓ {k}"))
        if k in inflight: inflight[k] -= 1
    page.on("request", on_req); page.on("requestfinished", on_done); page.on("requestfailed", on_done)

    OBSERVER = """window.__toasts = []; new MutationObserver((muts) => { for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue; const el = n.matches?.('[data-sonner-toast]') ? n : n.querySelector?.('[data-sonner-toast]');
        if (el) setTimeout(() => window.__toasts.push(el.innerText), 50); } }).observe(document.body, { childList: true, subtree: true });"""
    seen = {"n": 0}
    def install(): page.evaluate(OBSERVER); seen["n"] = 0
    def toast(timeout=120000):
        page.wait_for_function("(n) => window.__toasts.length > n", arg=seen["n"], timeout=timeout)
        t = page.evaluate("window.__toasts"); seen["n"] = len(t); return t[-1]
    def header(): return page.locator("h1").first.inner_text().replace("\n", " ").strip()
    def reset_net():
        for k in net: net[k] = 0
        for k in peak: peak[k] = 0
        set_images.clear(); complete_sent.clear(); timeline.clear()
    def open_quick():
        page.goto("http://localhost:3000/admin/inventory-items/images/quick")
        page.wait_for_selector("text=Kéo thả ảnh vào đây hoặc bấm Chọn ảnh", timeout=30000); install()
    def wait_idle():
        page.wait_for_function("() => !document.body.innerText.includes('Đang kiểm tra') && !document.body.innerText.includes('Đang cập nhật')", timeout=180000)

    def done_cards(): return page.locator("div.grid").locator('text="Đã cập nhật"').count()
    def run_batch(files, key):
        open_quick()
        page.locator('input[type="file"][multiple]').set_input_files([str(f) for f in files]); wait_idle()
        obs[f"{key}_header_before"] = header()
        reset_net(); t0 = time.monotonic()
        page.locator('button:has-text("Cập nhật")').last.click()
        obs[f"{key}_toast"] = toast(); wait_idle()
        obs[f"{key}_elapsed_s"] = round(time.monotonic() - t0, 2)
        obs[f"{key}_net"] = dict(net); obs[f"{key}_peak"] = dict(peak)
        obs[f"{key}_done_cards"] = done_cards()
        obs[f"{key}_set_images_owners"] = len(set_images)

    # ── S1: six one-file owners — the case the old runner serialised ──
    run_batch(six, "s1")
    page.screenshot(path=str(OUT / "01-s1.png"), full_page=True)
    obs["s1_db_singles"] = psql("SELECT p.code || '=' || (SELECT count(*) FROM media_objects m WHERE m.owner_id=p.id AND m.status='ATTACHED') FROM products p WHERE p.code = ANY(ARRAY['" + "','".join(SINGLES) + "']) ORDER BY p.code")
    obs["s1_timeline_first_12"] = timeline[:12]

    # ── S1b: one owner with three files + two singles — attach order and the ≤ 3 ceiling ──
    run_batch(five, "s1b")
    a_calls = [(t, b) for t, b in set_images if b.get("assignments", [{}])[0].get("id") == A_ID]
    obs["s1b_A_set_images_calls"] = len(a_calls)
    if a_calls:
        t_a, body_a = a_calls[0]
        ids_a = body_a["assignments"][0]["imageIds"]
        obs["s1b_A_image_count"] = len(ids_a)
        obs["s1b_A_set_images_after_completes_sent"] = all(i in complete_sent for i in ids_a) and t_a >= max(complete_sent[i] for i in ids_a)
    page.screenshot(path=str(OUT / "02-s1b.png"), full_page=True)
    obs["s1b_db_A"] = psql(f"SELECT string_agg(file_name || '@' || sort_order, ', ' ORDER BY sort_order) FROM media_objects WHERE owner_id='{A_ID}' AND status='ATTACHED'")

    # ── S2: leave during a run (storage slowed to 1 s per POST so the run is still going) ──
    def slow(route):
        time.sleep(1.0); route.continue_()
    page.route(lambda u: "/erp-media-public" in u or ":9000" in u, slow)
    open_quick()
    page.locator('input[type="file"][multiple]').set_input_files([str(f) for f in eight]); wait_idle()
    reset_net(); page.locator('button:has-text("Cập nhật")').last.click()
    page.wait_for_selector("text=Đang cập nhật", timeout=15000)
    page.locator('button:has-text("Quay lại")').click()
    dlg = page.locator('[role="dialog"]'); dlg.wait_for(timeout=10000)
    obs["s2_dialog"] = dlg.inner_text().replace("\n", " | ")
    page.screenshot(path=str(OUT / "03-s2-dialog.png"))
    dlg.locator('button:has-text("Rời trang")').click()
    page.wait_for_selector('button:has-text("In tem mã")', timeout=15000)
    obs["s2_left_to_list"] = True
    obs["s2_net_at_leave"] = dict(net); obs["s2_peak"] = dict(peak)
    time.sleep(3)
    obs["s2_set_images_after_leave"] = net["set_images"]
    obs["s2_db_A_unchanged"] = psql(f"SELECT string_agg(file_name || '@' || sort_order, ', ' ORDER BY sort_order) FROM media_objects WHERE owner_id='{A_ID}' AND status='ATTACHED'") == obs["s1b_db_A"]
    browser.close()

# ── reset the six one-file products (same transition set-images applies to replaced images) ──
psql("UPDATE media_objects SET status='DELETED', deleted_at=now() WHERE status='ATTACHED' AND created_at >= '" + started_at + "' AND owner_id = ANY(ARRAY['" + "','".join(single_ids) + "']::uuid[])")
obs["reset_singles"] = psql("SELECT p.code || '=' || (SELECT count(*) FROM media_objects m WHERE m.owner_id=p.id AND m.status='ATTACHED') FROM products p WHERE p.code = ANY(ARRAY['" + "','".join(SINGLES) + "']) ORDER BY p.code")
print(json.dumps(obs, ensure_ascii=False, indent=1))
