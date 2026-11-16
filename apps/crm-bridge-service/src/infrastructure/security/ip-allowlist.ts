import { BlockList, isIP } from 'node:net';

const IPV4_MAPPED_PREFIX = /^::ffff:/i;

/** Quita el prefijo IPv4-mapped (`::ffff:10.0.0.1` → `10.0.0.1`) y el identificador de zona (`fe80::1%eth0`). */
export function normalizeIp(ip: string): string {
  const withoutZone = ip.trim().replace(/%.+$/, '');
  if (IPV4_MAPPED_PREFIX.test(withoutZone)) {
    const candidate = withoutZone.replace(IPV4_MAPPED_PREFIX, '');
    if (isIP(candidate) === 4) {
      return candidate;
    }
  }
  return withoutZone;
}

/**
 * Allowlist de IPs para el webhook de Chatwoot (C7). Entradas IPv4/IPv6 sueltas o en CIDR,
 * evaluadas con `net.BlockList`. Lista vacía = sin filtro. Se evalúa sobre la IP real del
 * cliente (`request.ip` con `trust proxy` = 1: la que añade el gateway).
 */
export class IpAllowlist {
  private readonly list = new BlockList();
  readonly enabled: boolean;

  constructor(entries: readonly string[]) {
    for (const raw of entries) {
      const entry = raw.trim();
      if (entry === '') {
        continue;
      }
      const [address = '', prefix] = entry.split('/');
      const normalized = normalizeIp(address);
      const family = isIP(normalized);
      if (family === 0) {
        throw new Error(`WEBHOOK_IP_ALLOWLIST: entrada inválida (${entry})`);
      }
      const type = family === 4 ? 'ipv4' : 'ipv6';
      if (prefix === undefined) {
        this.list.addAddress(normalized, type);
      } else {
        const bits = Number(prefix);
        if (!Number.isInteger(bits) || bits < 0 || bits > (family === 4 ? 32 : 128)) {
          throw new Error(`WEBHOOK_IP_ALLOWLIST: prefijo CIDR inválido (${entry})`);
        }
        this.list.addSubnet(normalized, bits, type);
      }
    }
    this.enabled = entries.some((entry) => entry.trim() !== '');
  }

  /** `true` si la IP está permitida (o si no hay filtro). Una IP desconocida o inválida se rechaza. */
  allows(ip: string | undefined | null): boolean {
    if (!this.enabled) {
      return true;
    }
    if (!ip) {
      return false;
    }
    const normalized = normalizeIp(ip);
    const family = isIP(normalized);
    if (family === 0) {
      return false;
    }
    return this.list.check(normalized, family === 4 ? 'ipv4' : 'ipv6');
  }
}
