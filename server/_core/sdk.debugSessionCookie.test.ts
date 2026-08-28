import { beforeAll, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { COOKIE_NAME } from "../../shared/const";
import type { Request } from "express";

// ENV lê process.env.JWT_SECRET uma única vez, na primeira importação do
// módulo — por isso a variável precisa existir ANTES do import dinâmico
// abaixo, e não pode ser um `import` estático de topo de arquivo (que o
// ESM resolveria antes desta linha rodar).
let sdk: (typeof import("./sdk"))["sdk"];
const TEST_SECRET = "segredo-de-teste-para-debugSessionCookie-32ch";

beforeAll(async () => {
  process.env.JWT_SECRET = TEST_SECRET;
  // createSessionToken() grava ENV.appId no payload; sem VITE_APP_ID
  // configurada ele fica "" e o próprio código de produção (verifySession,
  // e agora debugSessionCookie) rejeita o token por appId vazio — não é
  // bug do diagnóstico, é o comportamento real quando essa env falta.
  process.env.VITE_APP_ID = "app-de-teste";
  ({ sdk } = await import("./sdk"));
});

function makeRequest(cookieHeader?: string): Request {
  return { headers: cookieHeader ? { cookie: cookieHeader } : {} } as Request;
}

describe("sdk.debugSessionCookie", () => {
  it("reporta 'missing' quando não há cabeçalho de cookie algum", async () => {
    const result = await sdk.debugSessionCookie(makeRequest());
    expect(result).toEqual({
      cookieHeaderPresent: false,
      sessionCookiePresent: false,
      verify: "missing",
    });
  });

  it("reporta 'missing' quando há cookies mas não o de sessão", async () => {
    const result = await sdk.debugSessionCookie(makeRequest("outro=valor"));
    expect(result.cookieHeaderPresent).toBe(true);
    expect(result.sessionCookiePresent).toBe(false);
    expect(result.verify).toBe("missing");
  });

  it("reporta 'ok' para um cookie de sessão válido", async () => {
    const token = await sdk.createSessionToken("open-id-teste", {
      name: "Teste",
    });
    const result = await sdk.debugSessionCookie(
      makeRequest(`${COOKIE_NAME}=${token}`)
    );
    expect(result).toEqual({
      cookieHeaderPresent: true,
      sessionCookiePresent: true,
      verify: "ok",
    });
  });

  it("reporta 'invalid_signature' para um cookie assinado com outro segredo", async () => {
    const wrongKey = new TextEncoder().encode(
      "segredo-completamente-diferente-32-chars"
    );
    const badToken = await new SignJWT({
      openId: "x",
      appId: "y",
      name: "z",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(wrongKey);

    const result = await sdk.debugSessionCookie(
      makeRequest(`${COOKIE_NAME}=${badToken}`)
    );
    expect(result.cookieHeaderPresent).toBe(true);
    expect(result.sessionCookiePresent).toBe(true);
    expect(result.verify).toBe("invalid_signature");
  });

  it("reporta 'expired' para um cookie de sessão vencido", async () => {
    const key = new TextEncoder().encode(TEST_SECRET);
    const expiredToken = await new SignJWT({
      openId: "x",
      appId: "y",
      name: "z",
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10)
      .sign(key);

    const result = await sdk.debugSessionCookie(
      makeRequest(`${COOKIE_NAME}=${expiredToken}`)
    );
    expect(result.verify).toBe("expired");
  });

  it("reporta 'malformed' para um valor de cookie que não é um JWT", async () => {
    const result = await sdk.debugSessionCookie(
      makeRequest(`${COOKIE_NAME}=nao-eh-um-jwt`)
    );
    expect(result.cookieHeaderPresent).toBe(true);
    expect(result.sessionCookiePresent).toBe(true);
    expect(result.verify).toBe("malformed");
  });

  it("nunca inclui o valor do cookie ou do segredo no resultado", async () => {
    const token = await sdk.createSessionToken("open-id-teste", {
      name: "Teste",
    });
    const result = await sdk.debugSessionCookie(
      makeRequest(`${COOKIE_NAME}=${token}`)
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain(TEST_SECRET);
  });
});
