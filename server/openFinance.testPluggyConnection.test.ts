import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `testPluggyConnection()` é a ação administrativa que valida credenciais
 * sandbox da Pluggy sem qualquer efeito colateral: só POST /auth (pega uma
 * API key de sessão) e GET /connectors?countries=BR (prova que a API key
 * funciona). Nunca cria Connect Token, nunca registra/altera webhook, nunca
 * inicia consentimento, nunca consulta contas/transações, nunca grava no
 * banco. A resposta ao admin é sempre {success, message} — sem lista de
 * conectores, sem a API key de sessão, sem o client secret.
 *
 * `getDb` mockado para lançar deixa explícito, em teste, que nenhum caminho
 * do código sob teste toca o banco.
 */
vi.mock("./systemSettings", () => ({
  getSetting: vi.fn(),
}));
vi.mock("./db", () => ({
  getDb: vi.fn(async () => {
    throw new Error("getDb não deveria ser chamado por testPluggyConnection()");
  }),
}));
// resolvePluggyConfig() prioriza ENV sobre o valor mockado de getSetting
// (`ENV.pluggyClientId || fromDb || ""`). Sem isolar ENV, este arquivo passa
// hoje só porque a máquina de validação não tem PLUGGY_CLIENT_ID/SECRET no
// ambiente — mas quebraria (dois testes) numa máquina/CI que os tivesse,
// como apontado em revisão automatizada na PR original. ENV é um objeto
// congelado no import de "./_core/env" a partir de process.env, então a
// única forma confiável de isolar é mockar o módulo inteiro.
vi.mock("./_core/env", () => ({
  ENV: {
    pluggyClientId: "",
    pluggyClientSecret: "",
    pluggyApiUrl: "https://api.pluggy.ai",
    pluggyWebhookSecret: "",
    publicAppUrl: "",
  },
}));

import { getSetting } from "./systemSettings";
import { testPluggyConnection } from "./openFinance";

type FetchCall = { url: string; method: string; body: unknown };

function mockCredentials(clientId: string, clientSecret: string) {
  vi.mocked(getSetting).mockImplementation(async (key: string) => {
    if (key === "pluggy_client_id") return clientId;
    if (key === "pluggy_client_secret") return clientSecret;
    return "";
  });
}

function trackedFetch(
  handler: (url: string, init: RequestInit | undefined) => { ok: boolean; status?: number; json: () => Promise<unknown> }
) {
  const calls: FetchCall[] = [];
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return handler(url, init);
  });
  return { calls, fetchMock };
}

describe("testPluggyConnection — ação administrativa segura", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.mocked(getSetting).mockReset();
  });

  it("chama só POST /auth e GET /connectors?countries=BR, nessa ordem, e devolve sucesso sanitizado", async () => {
    mockCredentials("sandbox-client-id", "sandbox-client-secret");

    const { calls, fetchMock } = trackedFetch((url, init) => {
      if (url.endsWith("/auth")) {
        return { ok: true, json: async () => ({ apiKey: "fake-session-api-key" }) };
      }
      if (url.includes("/connectors?countries=BR")) {
        return {
          ok: true,
          json: async () => ({ results: [{ id: 1, name: "Banco Fake Sandbox" }] }),
        };
      }
      throw new Error(`chamada inesperada em testPluggyConnection: ${init?.method ?? "GET"} ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await testPluggyConnection();

    expect(result).toEqual({
      success: true,
      message:
        "API Pluggy conectada. Credenciais válidas para consultar conectores brasileiros.",
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toMatch(/\/auth$/);
    expect(calls[0].body).toEqual({
      clientId: "sandbox-client-id",
      clientSecret: "sandbox-client-secret",
    });
    expect(calls[1].method).toBe("GET");
    expect(calls[1].url).toContain("/connectors?countries=BR");

    // Sanitização: nada do provedor (lista de conectores) nem credenciais
    // (API key de sessão, client secret) vazam na resposta ao admin.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Banco Fake Sandbox");
    expect(serialized).not.toContain("fake-session-api-key");
    expect(serialized).not.toContain("sandbox-client-secret");
  });

  it("nunca toca connect_token, webhooks, accounts ou transactions", async () => {
    mockCredentials("sandbox-client-id", "sandbox-client-secret");

    const forbiddenPaths = ["/connect_token", "/webhooks", "/accounts", "/transactions", "/items"];
    const { fetchMock } = trackedFetch((url, init) => {
      if (forbiddenPaths.some(path => url.includes(path))) {
        throw new Error(`rota fora do escopo permitido chamada: ${init?.method ?? "GET"} ${url}`);
      }
      if (url.endsWith("/auth")) {
        return { ok: true, json: async () => ({ apiKey: "fake-session-api-key" }) };
      }
      return { ok: true, json: async () => ({ results: [] }) };
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(testPluggyConnection()).resolves.toMatchObject({ success: true });
  });

  it("com credenciais inválidas, devolve falha sanitizada sem vazar o client secret", async () => {
    // Cenário adversarial: a própria Pluggy ecoa o valor submetido no corpo
    // do erro (algumas APIs fazem isso para depuração). Sem redação no
    // código, isso vazaria a credencial direto pro admin. As credenciais
    // aqui precisam aparecer LITERALMENTE no corpo mockado — um erro
    // genérico sem o valor provaria só que a mensagem fixa não continha a
    // credencial, não que o código a remove quando ela está presente.
    mockCredentials(
      "sandbox-client-id-real",
      "sandbox-client-secret-real-xyz"
    );

    const { fetchMock } = trackedFetch(url => {
      if (url.endsWith("/auth")) {
        return {
          ok: false,
          status: 401,
          json: async () => ({
            message:
              "Invalid credentials for clientId sandbox-client-id-real and clientSecret sandbox-client-secret-real-xyz",
          }),
        };
      }
      throw new Error(`chamada inesperada: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await testPluggyConnection();

    expect(result.success).toBe(false);
    expect(result.message).not.toContain("sandbox-client-id-real");
    expect(result.message).not.toContain("sandbox-client-secret-real-xyz");
    // A mensagem continua útil pro admin (não é apagada por completo).
    expect(result.message).toContain("Invalid credentials");
  });

  it("com Client ID/Secret vazios, falha sem chamar a rede", async () => {
    mockCredentials("", "");
    const { calls, fetchMock } = trackedFetch(url => {
      throw new Error(`não deveria chamar a rede sem credenciais: ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await testPluggyConnection();

    expect(result.success).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
