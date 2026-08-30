import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./asaas", () => ({
  resolveAsaasApiKey: vi.fn(),
  resolveAsaasApiUrl: vi.fn(),
}));

vi.mock("mysql2/promise", () => ({
  default: {
    createConnection: vi.fn(async () => ({
      query: vi.fn(async () => [[]]),
      end: vi.fn(async () => undefined),
    })),
  },
}));

import { resolveAsaasApiKey, resolveAsaasApiUrl } from "./asaas";
import { executeDryRun } from "./asaasStagingDryRun";

describe("executeDryRun — corrida contra o prazo cobre a operação inteira", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete process.env.STAGING_DATABASE_URL;
  });

  it("não fica preso em 'running' quando resolveAsaasApiKey() nunca resolve", async () => {
    vi.mocked(resolveAsaasApiKey).mockReturnValue(new Promise(() => {}));

    const outcome = await executeDryRun(20);

    expect(outcome).toEqual({
      completed: false,
      failure: {
        stage: "inicializacao",
        type: "timeout_total",
        pagesStarted: 0,
        lastOffset: null,
      },
    });
  });

  it("resolve a URL da Asaas a partir da chave (sandbox vs produção), nunca por padrão fixo", async () => {
    process.env.STAGING_DATABASE_URL =
      "mysql://user:pass@host.test/exclusive_club_staging_test";
    vi.mocked(resolveAsaasApiKey).mockResolvedValue("$aact_hmlg_fake-sandbox-key");
    vi.mocked(resolveAsaasApiUrl).mockReturnValue("https://sandbox.asaas.com/api/v3");

    const calledUrls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL | string) => {
        calledUrls.push(String(url));
        return { ok: true, json: async () => ({ data: [], hasMore: false }) };
      })
    );

    const outcome = await executeDryRun(5_000);

    expect(resolveAsaasApiUrl).toHaveBeenCalledWith("$aact_hmlg_fake-sandbox-key");
    expect(calledUrls.every(url => url.startsWith("https://sandbox.asaas.com"))).toBe(
      true
    );
    expect(outcome.completed).toBe(true);
  });
});
