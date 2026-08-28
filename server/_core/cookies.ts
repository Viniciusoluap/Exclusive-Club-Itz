import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  // const hostname = req.hostname;
  // const shouldSetDomain =
  //   hostname &&
  //   !LOCAL_HOSTS.has(hostname) &&
  //   !isIpAddress(hostname) &&
  //   hostname !== "127.0.0.1" &&
  //   hostname !== "::1";

  // const domain =
  //   shouldSetDomain && !hostname.startsWith(".")
  //     ? `.${hostname}`
  //     : shouldSetDomain
  //       ? hostname
  //       : undefined;

  // SameSite=None exige Secure=true por especificação (RFC 6265bis); quando
  // isSecureRequest() não detecta HTTPS de forma confiável atrás de um proxy
  // (ex.: x-forwarded-proto ausente ou não repassado), o navegador rejeita o
  // Set-Cookie inteiro em silêncio — sem erro visível, a sessão simplesmente
  // nunca persiste. O app é same-origin (frontend e API servidos do mesmo
  // domínio, ver client/src/main.tsx: url "/api/trpc" relativo, sem iframe),
  // então não há necessidade real de SameSite=None: o callback OAuth em
  // /api/oauth/callback já está no nosso domínio quando o Set-Cookie ocorre,
  // e Lax cobre a navegação de topo que segue (res.redirect para "/").
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(req),
  };
}
