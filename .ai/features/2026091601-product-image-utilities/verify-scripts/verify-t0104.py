"""T-01-04 browser check: per-row "Tải ảnh" on the Cập nhật ảnh page, driven with the saved
backoffice session. Exercises the client-side limit gate (no upload request may leave),
a 2-file upload on C (owner ITEM), a 5-file replace on C (old set → DELETED, concurrency ≤ 3),
then resets C to zero images through the edit form so the fixture is unchanged.
DB assertions are done by the caller with psql; this script prints what it observed."""
import json, os, struct, sys, zlib, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path("/Users/akenzy/Documents/work/erp/be/erp3")
OUT = Path(__file__).parent / ".out" / "t0104"
OUT.mkdir(parents=True, exist_ok=True)
C_ID = "7fa5daba-f56f-439b-b9fe-2dc30e6f5e34"


def png(path: Path, size_bytes: int | None = None, seed: int = 0):
    """A valid 2x2 RGB PNG; optionally padded with a private ancillary chunk to a target size."""
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    raw = b"".join(b"\x00" + bytes([seed % 256, (seed * 7) % 256, (seed * 13) % 256] * 2) for _ in range(2))
    body = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 2, 2, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw))
    if size_bytes and size_bytes > len(body) + 24:
        body += chunk(b"prVt", os.urandom(size_bytes - len(body) - 24))
    body += chunk(b"IEND", b"")
    path.write_bytes(body)
    return path


files = {
    "big": png(OUT / "to-3mb.png", 3 * 1024 * 1024),
    "pdf": OUT / "tai-lieu.pdf",
    "c": [png(OUT / f"c{i}.png", seed=i) for i in (1, 2)],
    "r": [png(OUT / f"r{i}.png", seed=10 + i) for i in range(1, 6)],
    "many": [png(OUT / f"m{i:02d}.png", seed=20 + i) for i in range(1, 12)],
}
files["pdf"].write_bytes(b"%PDF-1.4\n%%EOF\n")

observed = {}
with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(storage_state=str(ROOT / ".ai/.auth/local-backoffice.json"), viewport={"width": 1440, "height": 900})
    page = ctx.new_page()

    # network bookkeeping: ticket creations, storage POSTs, set-images; in-flight maxima
    counts = {"uploads": 0, "storage": 0, "set_images": 0}
    inflight = {"uploads": 0, "storage": 0}
    peak = {"uploads": 0, "storage": 0}

    def classify(req):
        u = req.url
        if req.method != "POST":
            return None
        if "/media/uploads" in u and not u.endswith("/complete"):
            return "uploads"
        if "/erp-media-public" in u or ":9000" in u:
            return "storage"
        if "/inventory/items/set-images" in u:
            return "set_images"
        return None

    def on_request(req):
        k = classify(req)
        if not k:
            return
        counts[k] += 1
        if k in inflight:
            inflight[k] += 1
            peak[k] = max(peak[k], inflight[k])

    def on_done(req):
        k = classify(req)
        if k in inflight:
            inflight[k] -= 1

    page.on("request", on_request)
    page.on("requestfinished", on_done)
    page.on("requestfailed", on_done)

    OBSERVER = """
      window.__toasts = [];
      new MutationObserver((muts) => {
        for (const m of muts) for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          const el = n.matches?.('[data-sonner-toast]') ? n : n.querySelector?.('[data-sonner-toast]');
          if (el) setTimeout(() => window.__toasts.push(el.innerText), 50);
        }
      }).observe(document.body, { childList: true, subtree: true });
    """
    seen = {"n": 0}

    def install_observer():
        page.evaluate(OBSERVER); seen["n"] = 0

    def toast_text(timeout=30000):
        page.wait_for_function("(n) => window.__toasts.length > n", arg=seen["n"], timeout=timeout)
        texts = page.evaluate("window.__toasts")
        seen["n"] = len(texts)
        return texts[-1]

    def dismiss_toasts():
        page.wait_for_timeout(300)

    def reset_counts():
        for k in counts: counts[k] = 0
        for k in peak: peak[k] = 0

    page.goto("http://localhost:3000/admin/inventory-items/images")
    page.wait_for_selector("text=Hiển thị 1 - 50 trên 2.446 kết quả", timeout=30000)
    install_observer()
    row = page.locator('tbody tr:has-text("AAA-MEDIA-C")')
    assert row.count() == 1, "row C not on page 1"
    picker = row.locator('input[type="file"]')

    # 1. limit gate — nothing may leave the browser
    reset_counts(); picker.set_input_files(str(files["big"]))
    observed["big"] = toast_text(); dismiss_toasts()
    reset_counts_big = dict(counts)
    reset_counts(); picker.set_input_files(str(files["pdf"]))
    observed["pdf"] = toast_text(); dismiss_toasts()
    reset_counts_pdf = dict(counts)
    reset_counts(); picker.set_input_files([str(f) for f in files["many"]])
    observed["many"] = toast_text(); dismiss_toasts()
    reset_counts_many = dict(counts)
    observed["gate_requests"] = {"big": reset_counts_big, "pdf": reset_counts_pdf, "many": reset_counts_many}
    page.screenshot(path=str(OUT / "01-gate.png"))

    # 2. two valid files on C (ITEM owner)
    reset_counts(); picker.set_input_files([str(f) for f in files["c"]])
    observed["two"] = toast_text(60000)
    observed["two_requests"] = dict(counts)
    page.screenshot(path=str(OUT / "02-two-uploaded.png"))
    # MISSING filter ⇒ the row must disappear after the refetch
    page.wait_for_selector('tbody tr:has-text("AAA-MEDIA-C")', state="detached", timeout=30000)
    observed["row_gone_from_missing"] = True
    dismiss_toasts()

    # 3. replace with five files (concurrency ≤ 3, old set → DELETED)
    page.locator('[aria-label="Tìm kiếm theo"]').click()
    page.locator('[role="option"]:has-text("Hàng hóa đã cập nhật ảnh")').click()
    page.locator('button:has-text("Lấy dữ liệu")').click()
    page.wait_for_selector("text=Hiển thị 1 - 3 trên 3 kết quả", timeout=30000)
    row = page.locator('tbody tr:has-text("AAA-MEDIA-C")')
    observed["thumb_after_two"] = row.locator('img[src*="/erp-media-public/"]').count()
    reset_counts(); row.locator('input[type="file"]').set_input_files([str(f) for f in files["r"]])
    observed["five"] = toast_text(90000)
    observed["five_requests"] = dict(counts)
    observed["five_peak"] = dict(peak)
    page.screenshot(path=str(OUT / "03-five-replaced.png"))
    dismiss_toasts()

    # 4. reset C through the edit form (Xóa ảnh × 5, Lưu)
    page.goto(f"http://localhost:3000/admin/inventory-items/{C_ID}/edit")
    page.wait_for_selector('#create-code[value="AAA-MEDIA-C"]', timeout=30000)
    page.wait_for_selector('img[src*="/erp-media-public/"]', timeout=30000)
    install_observer()
    observed["edit_form_images"] = page.locator('img[src*="/erp-media-public/"]').count()
    while page.locator('button[aria-label="Xóa ảnh"]').count():
        page.locator('button[aria-label="Xóa ảnh"]').first.click()
    page.locator('text="Lưu"').click()
    observed["reset_toast"] = toast_text(60000)
    browser.close()

print(json.dumps(observed, ensure_ascii=False, indent=1))
