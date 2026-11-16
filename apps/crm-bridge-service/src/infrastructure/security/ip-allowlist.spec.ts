import { isIpOrCidr } from '../../config/env.definition';
import { IpAllowlist, normalizeIp } from './ip-allowlist';

describe('IpAllowlist (C7)', () => {
  it('sin entradas no filtra', () => {
    const allowlist = new IpAllowlist([]);
    expect(allowlist.enabled).toBe(false);
    expect(allowlist.allows('203.0.113.9')).toBe(true);
    expect(allowlist.allows(undefined)).toBe(true);
  });

  it('IPv4: dirección exacta y CIDR', () => {
    const allowlist = new IpAllowlist(['10.0.0.0/8', '192.168.1.10']);
    expect(allowlist.allows('10.20.30.40')).toBe(true);
    expect(allowlist.allows('192.168.1.10')).toBe(true);
    expect(allowlist.allows('192.168.1.11')).toBe(false);
    expect(allowlist.allows('11.0.0.1')).toBe(false);
  });

  it('IPv6: dirección exacta y CIDR', () => {
    const allowlist = new IpAllowlist(['2001:db8::/32', '::1']);
    expect(allowlist.allows('2001:db8:abcd::1')).toBe(true);
    expect(allowlist.allows('::1')).toBe(true);
    expect(allowlist.allows('2001:db9::1')).toBe(false);
    expect(allowlist.allows('fe80::1%eth0')).toBe(false);
  });

  it('trata las IPv4-mapped (::ffff:a.b.c.d) como IPv4', () => {
    const allowlist = new IpAllowlist(['172.16.0.0/12']);
    expect(allowlist.allows('::ffff:172.20.1.2')).toBe(true);
    expect(allowlist.allows('::ffff:127.0.0.1')).toBe(false);
    expect(normalizeIp('::FFFF:10.0.0.1')).toBe('10.0.0.1');
  });

  it('con filtro, una IP ausente o inválida se rechaza', () => {
    const allowlist = new IpAllowlist(['10.0.0.0/8']);
    expect(allowlist.allows(undefined)).toBe(false);
    expect(allowlist.allows('no-es-ip')).toBe(false);
  });

  it('rechaza entradas inválidas al construir', () => {
    expect(() => new IpAllowlist(['10.0.0.0/33'])).toThrow(/CIDR/);
    expect(() => new IpAllowlist(['chatwoot.example.com'])).toThrow(/inválida/);
  });

  it('la validación del entorno acepta IPs y CIDR v4/v6', () => {
    expect(isIpOrCidr('10.0.0.0/8')).toBe(true);
    expect(isIpOrCidr('2001:db8::/32')).toBe(true);
    expect(isIpOrCidr('::1')).toBe(true);
    expect(isIpOrCidr('10.0.0.0/33')).toBe(false);
    expect(isIpOrCidr('2001:db8::/129')).toBe(false);
    expect(isIpOrCidr('host.local')).toBe(false);
    expect(isIpOrCidr('10.0.0.1/8/1')).toBe(false);
  });
});
