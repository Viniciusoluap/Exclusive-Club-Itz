/**
 * Story 42 (SYS-20): valida que uma URL vinda do banco (documentUrl,
 * contractUrl, photoBeforeUrl, ...) aponta para um host externo antes
 * de o servidor fazer fetch nela (ex.: para embutir em PDF). Sem isso,
 * um valor malicioso nesses campos poderia forçar o servidor a
 * requisitar endereços internos (localhost, rede privada, metadata de
 * cloud em 169.254.169.254) — um SSRF clássico.
 */

const PRIVATE_IPV4_RANGES: Array<[number, number]> = [
  [ipToInt("10.0.0.0"), ipToInt("10.255.255.255")],
  [ipToInt("172.16.0.0"), ipToInt("172.31.255.255")],
  [ipToInt("192.168.0.0"), ipToInt("192.168.255.255")],
  [ipToInt("127.0.0.0"), ipToInt("127.255.255.255")],
  [ipToInt("169.254.0.0"), ipToInt("169.254.255.255")], // link-local, inclui metadata de cloud
  [ipToInt("0.0.0.0"), ipToInt("0.255.255.255")],
];

function ipToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isPrivateOrLocalIPv4(host: string): boolean {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const n = ipToInt(host);
  return PRIVATE_IPV4_RANGES.some(([start, end]) => n >= start && n <= end);
}

export function assertSafeExternalUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`URL inválida: ${url}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Esquema de URL não permitido: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local") ||
    isPrivateOrLocalIPv4(hostname)
  ) {
    throw new Error(`URL aponta para host interno/privado, bloqueada: ${hostname}`);
  }
}
