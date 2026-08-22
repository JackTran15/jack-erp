/**
 * `crypto.randomUUID()` is a **secure-context-only** API: it exists on HTTPS and
 * on localhost, but is `undefined` when the app is served over plain HTTP on a
 * real hostname (e.g. http://erp.giaymt.com.vn). Call sites run during module
 * init, so its absence throws before React mounts and the page renders blank.
 *
 * `crypto.getRandomValues()` is NOT secure-context gated, so the fallback is
 * still cryptographically random — it is a real RFC 4122 v4 UUID, not Math.random.
 *
 * Delete this file once the site is served over HTTPS.
 */
if (typeof crypto.randomUUID !== "function") {
  crypto.randomUUID = function randomUUID() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
    return [
      hex.slice(0, 4).join(""),
      hex.slice(4, 6).join(""),
      hex.slice(6, 8).join(""),
      hex.slice(8, 10).join(""),
      hex.slice(10, 16).join(""),
    ].join("-") as ReturnType<Crypto["randomUUID"]>;
  };
}
