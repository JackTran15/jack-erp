"""T-02-02 browser check: quick-update page classifies dropped files, counter, Đổi ảnh, (x),
duplicate STT on a later drop, 200-file bulk drop responsiveness. No upload may leave the page."""
import json, os, struct, time, zlib
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path("/Users/akenzy/Documents/work/erp/be/erp3")
OUT = Path(__file__).parent / ".out" / "t0202"
OUT.mkdir(parents=True, exist_ok=True)


def png(path: Path, size_bytes=None, seed=0):
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
    png(OUT / "AAA-MEDIA-A (01).png", seed=1),
    png(OUT / "AAA-MEDIA-A (02).png", seed=2),
    png(OUT / "AAA-MEDIA-B.png", seed=3),
    png(OUT / "aaamed-39-đen.png", seed=4),
    png(OUT / "KHONG-CO.png", seed=5),
    png(OUT / "to-3mb.png", 3 * 1024 * 1024),
]
c_file = png(OUT / "AAA-MEDIA-C.png", seed=6)
dup_file = png(OUT / "AAA-MEDIA-A (01).jpg", seed=7)
bulk = [png(OUT / f"ZZZ-BULK-{i:03d}.png", 100 * 1024, seed=100 + i) for i in range(200)]

obs = {}
with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(storage_state=str(ROOT / ".ai/.auth/local-backoffice.json"), viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    net = {"uploads": 0, "set_images": 0, "resolve": 0}

    def on_req(req):
        u = req.url
        if req.method != "POST":
            return
        if "/media/uploads" in u: net["uploads"] += 1
        elif "/inventory/items/set-images" in u: net["set_images"] += 1
        elif "/resolve-image-names" in u: net["resolve"] += 1
    page.on("request", on_req)

    def header():
        return page.locator("h1").first.inner_text().replace("\n", " ").strip()

    def labels():
        # second <p> of each card = status line
        return page.locator("p.italic, p.text-muted-foreground, p.text-foreground + p").all_inner_texts()

    def card_labels():
        return page.evaluate("""() => Array.from(document.querySelectorAll('img[loading="lazy"]')).map(img => {
            const card = img.closest('div[class*="rounded"]') || img.parentElement.parentElement;
            const ps = card.querySelectorAll('p');
            return { name: ps[0]?.textContent, status: ps[1]?.textContent };
        })""")

    # 1. arrive via the Tiện ích menu
    page.goto("http://localhost:3000/admin/inventory-items")
    page.wait_for_selector("tbody tr", timeout=30000)
    page.locator('button:has-text("Tiện ích")').click()
    page.locator('[role="menuitem"]:has-text("Cập nhật ảnh nhanh")').click()
    page.wait_for_url("**/admin/inventory-items/images/quick", timeout=15000)
    page.wait_for_selector("text=Kéo thả ảnh vào đây hoặc bấm Chọn ảnh", timeout=15000)
    obs["header_empty"] = header()
    obs["update_disabled_empty"] = page.locator('button:has-text("Cập nhật")').last.is_disabled()
    page.screenshot(path=str(OUT / "01-empty.png"))

    picker = page.locator('input[type="file"][multiple]')

    # 2. six files (AC-11)
    picker.set_input_files([str(f) for f in six])
    page.wait_for_function("() => !document.body.innerText.includes('Đang kiểm tra')", timeout=30000)
    page.wait_for_timeout(300)
    obs["six_cards"] = card_labels()
    obs["header_six"] = header()
    obs["net_after_six"] = dict(net)
    obs["update_disabled_six"] = page.locator('button:has-text("Cập nhật")').last.is_disabled()
    page.screenshot(path=str(OUT / "02-six.png"), full_page=True)

    # 3. Đổi ảnh on the KHONG-CO card → AAA-MEDIA-C (AC-15)
    khong = page.locator('img[loading="lazy"]').nth(4).locator("xpath=ancestor::div[contains(@class,'rounded')][1]")
    khong.locator('input[type="file"]').set_input_files(str(c_file))
    page.wait_for_function("() => document.body.innerText.includes('Hàng hóa AAA-MEDIA-C')", timeout=30000)
    obs["header_after_replace"] = header()

    # 4. (x) on the 3 MB card (AC-15)
    page.locator('button[aria-label="Bỏ ảnh"]').last.click()
    page.wait_for_timeout(200)
    obs["header_after_remove"] = header()
    obs["cards_after_remove"] = page.locator('img[loading="lazy"]').count()

    # 5. duplicate STT on a later drop (AC-16)
    picker.set_input_files(str(dup_file))
    page.wait_for_function("() => document.body.innerText.includes('Trùng STT')", timeout=30000)
    obs["dup_cards"] = card_labels()
    obs["header_after_dup"] = header()
    page.screenshot(path=str(OUT / "03-dup.png"), full_page=True)

    # 6. 200 × 100 KB (NFR)
    t0 = time.time()
    picker.set_input_files([str(f) for f in bulk])
    page.wait_for_function("() => document.querySelectorAll('img[loading=\"lazy\"]').length >= 206", timeout=60000)
    page.wait_for_function("() => !document.body.innerText.includes('Đang kiểm tra')", timeout=60000)
    obs["bulk_seconds"] = round(time.time() - t0, 2)
    t1 = time.time(); page.mouse.wheel(0, 20000); page.wait_for_timeout(100); page.mouse.wheel(0, -20000)
    obs["scroll_roundtrip_ms"] = round((time.time() - t1) * 1000)
    obs["cards_after_bulk"] = page.locator('img[loading="lazy"]').count()
    obs["header_after_bulk"] = header()
    obs["net_final"] = dict(net)
    page.screenshot(path=str(OUT / "04-bulk.png"))

    # 7. Quay lại
    page.locator('button:has-text("Quay lại")').click()
    page.wait_for_selector('button:has-text("In tem mã")', timeout=15000)
    obs["back_to_list"] = True
    browser.close()

print(json.dumps(obs, ensure_ascii=False, indent=1))
