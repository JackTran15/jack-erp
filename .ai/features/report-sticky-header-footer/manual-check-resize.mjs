// Kiểm ResizeObserver loop trên bảng báo cáo. Chỉ in ra lỗi thu được, không in credentials.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Đường dẫn suy ra từ vị trí tệp này (.ai/features/<slug>/) để chạy được trên máy khác.
const repo = fileURLToPath(new URL("../../../", import.meta.url));
const { chromium } = await import(
  repo + ".claude/skills/ai-dlc-verify/scripts/runner/node_modules/playwright/index.mjs"
);

const env = Object.fromEntries(
  readFileSync(repo + ".ai/credentials.env", "utf8")
    .split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push("pageerror: " + String(e.message).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });

await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
await page.locator("#login-org-id").fill(env.LOCAL_BACKOFFICE_ORG_ID);
await page.locator("#login-email").fill(env.LOCAL_BACKOFFICE_EMAIL);
await page.locator("#login-password").fill(env.LOCAL_BACKOFFICE_PASSWORD);
await page.locator('button[type="submit"]').click();
await page.locator("text=Đang khôi phục phiên").first().waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
await page.locator('button[aria-haspopup="menu"]').first().click();
await page.locator(`[role="menuitemradio"]:has-text("${env.LOCAL_BACKOFFICE_BRANCH_NAME}")`).first().click();
await page.locator(`button:has-text("${env.LOCAL_BACKOFFICE_BRANCH_NAME}")`).first().waitFor({ timeout: 30000 });

await page.goto("http://localhost:3000/reports/sales#revenue_detail_by_invoice_and_product", { waitUntil: "domcontentloaded" });
await page.locator('[aria-label="Từ ngày"]').fill("2026-08-01");
await page.locator('[aria-label="Đến ngày"]').fill("2026-08-31");
await page.locator('button:has-text("Lấy dữ liệu")').click();
await page.locator("tbody tr:nth-child(50)").first().waitFor({ timeout: 30000 });

const before = errors.length;

// Ép ResizeObserver chạy nhiều lần: đổi kích thước khung nhìn (đổi bề rộng cột → nhãn xuống dòng
// → chiều cao header đổi → callback bắn). Đây chính là đường mà AC-04 đi.
for (const w of [1440, 1100, 900, 760, 1280, 1440]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(600);
}
// Và kéo tay nắm resize của một cột — đường mà DSL của bộ chạy không diễn đạt được.
const handle = page.locator("thead tr:first-child th:nth-child(5) div.cursor-col-resize").first();
if (await handle.count()) {
  const box = await handle.boundingBox();
  if (box) {
    await page.mouse.move(box.x + 2, box.y + box.height / 2);
    await page.mouse.down();
    for (const dx of [-30, -60, -90, -110]) {
      await page.mouse.move(box.x + 2 + dx, box.y + box.height / 2);
      await page.waitForTimeout(120);
    }
    await page.mouse.up();
    await page.waitForTimeout(600);
  }
}
await page.locator("tbody tr:nth-child(50)").first().scrollIntoViewIfNeeded();
await page.locator("tbody tr:nth-child(22)").first().scrollIntoViewIfNeeded();
await page.waitForTimeout(800);
await page.screenshot({ path: process.argv[2] });

console.log("errors before resize storm: " + before);
console.log("errors after  resize storm: " + errors.length);
const ro = errors.filter((e) => e.toLowerCase().includes("resizeobserver"));
console.log("ResizeObserver-related: " + ro.length);
for (const e of errors.slice(0, 12)) console.log("  - " + e);
await browser.close();
