import { ipMatchesEntry, isIpWhitelisted } from './ip-match.util';

describe('ipMatchesEntry', () => {
  it('matches an exact single IPv4 address', () => {
    expect(ipMatchesEntry('203.0.113.5', '203.0.113.5')).toBe(true);
    expect(ipMatchesEntry('203.0.113.6', '203.0.113.5')).toBe(false);
  });

  it('matches inside a CIDR range', () => {
    // 203.0.113.0/28 covers .0 through .15
    expect(ipMatchesEntry('203.0.113.5', '203.0.113.0/28')).toBe(true);
    expect(ipMatchesEntry('203.0.113.15', '203.0.113.0/28')).toBe(true);
    expect(ipMatchesEntry('203.0.113.16', '203.0.113.0/28')).toBe(false);
  });

  it('/32 behaves like an exact match', () => {
    expect(ipMatchesEntry('203.0.113.5', '203.0.113.5/32')).toBe(true);
    expect(ipMatchesEntry('203.0.113.6', '203.0.113.5/32')).toBe(false);
  });

  it('/0 matches everything', () => {
    expect(ipMatchesEntry('1.2.3.4', '0.0.0.0/0')).toBe(true);
  });

  it('strips the ::ffff: IPv4-mapped prefix Express can report', () => {
    expect(ipMatchesEntry('::ffff:203.0.113.5', '203.0.113.5')).toBe(true);
  });

  it('rejects malformed input instead of throwing', () => {
    expect(ipMatchesEntry('not-an-ip', '203.0.113.5')).toBe(false);
    expect(ipMatchesEntry('203.0.113.5', 'not-an-ip')).toBe(false);
    expect(ipMatchesEntry('203.0.113.5', '203.0.113.0/99')).toBe(false);
    expect(ipMatchesEntry('999.0.0.1', '203.0.113.0/28')).toBe(false);
  });
});

describe('isIpWhitelisted', () => {
  it('is true when any entry matches', () => {
    expect(
      isIpWhitelisted('203.0.113.5', ['198.51.100.1', '203.0.113.0/28']),
    ).toBe(true);
  });

  it('is false when the whitelist is empty or nothing matches', () => {
    expect(isIpWhitelisted('203.0.113.5', [])).toBe(false);
    expect(isIpWhitelisted('203.0.113.5', ['198.51.100.1'])).toBe(false);
  });
});
