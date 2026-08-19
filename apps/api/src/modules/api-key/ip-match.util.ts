// IPv4-only (A-04 — IPv6 out of scope). No new dependency: hand-rolled bitwise match.

function ipToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    result = (result << 8) | n;
  }
  return result >>> 0;
}

/**
 * Express's `req.ip` reports IPv4-mapped addresses as `::ffff:203.0.113.5`
 * (dual-stack sockets, common for `::` binds and some proxies). Strip the
 * prefix so the IPv4-only whitelist below still matches the real address.
 */
function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
}

/** `entry` is either a bare IPv4 address or a `<ip>/<prefix>` CIDR range. */
export function ipMatchesEntry(ip: string, entry: string): boolean {
  const ipInt = ipToInt(normalizeIp(ip));
  if (ipInt === null) return false;

  const [rangeIp, prefixStr] = entry.split('/');
  const rangeInt = ipToInt(rangeIp);
  if (rangeInt === null) return false;

  if (prefixStr === undefined) return ipInt === rangeInt;

  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

export function isIpWhitelisted(ip: string, whitelist: string[]): boolean {
  return whitelist.some((entry) => ipMatchesEntry(ip, entry));
}

/** True when `entry` is a well-formed IPv4 address or `<ip>/<prefix>` CIDR range. */
export function isValidIpOrCidrEntry(entry: string): boolean {
  const [rangeIp, prefixStr] = entry.split('/');
  if (ipToInt(rangeIp) === null) return false;
  if (prefixStr === undefined) return true;

  const prefix = Number(prefixStr);
  return Number.isInteger(prefix) && prefix >= 0 && prefix <= 32;
}
