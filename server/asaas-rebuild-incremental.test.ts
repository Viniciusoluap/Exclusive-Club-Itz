import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createReport,
  databaseConnectionConfig,
  processCustomerPage,
  processPaymentPage,
  runReconciliation,
} from "../scripts/asaas_rebuild.mjs";

function jsonPage(data: unknown[], hasMore: boolean) {
  return {
    ok: true,
    json: async () => ({ data, hasMore }),
  };
}

describe("reconciliação incremental do Asaas", () => {
  it("preserva totais agregados ao processar várias páginas", async () => {
    const report = createReport("dry-run");
    const customersById = new Map();
    const localState = {
      clientsByEmail: new Map([
        ["alice@example.test", { id: 7, name: "Cliente local" }],
      ]),
      customersById: new Map(),
    };

    await processCustomerPage(
      [
        { id: "cus_1", email: "alice@example.test", name: "A" },
        { id: "cus_2", email: "sem-vinculo@example.test", name: "B" },
      ],
      { report, customersById }
    );
    await processCustomerPage(
      [{ id: "cus_3", email: "alice@example.test", name: "C" }],
      { report, customersById }
    );

    await processPaymentPage(
      [
        { id: "pay_1", customer: "cus_1", status: "RECEIVED", value: 10 },
        { id: "pay_2", customer: "cus_2", status: "OVERDUE", value: 20 },
      ],
      { report, customersById, localState }
    );
    await processPaymentPage(
      [
        { id: "pay_3", customer: "cus_3", status: "CONFIRMED", value: 30 },
        { id: "pay_4", customer: "cus_missing", status: "PENDING", value: 40 },
      ],
      { report, customersById, localState }
    );

    expect(report).toMatchObject({
      mode: "dry-run",
      customers: { total: 3, inserted: 0, updated: 0 },
      payments: {
        total: 4,
        insertedOrUpdated: 0,
        matchedLocalClients: 2,
        unmatchedLocalClients: 2,
      },
      statuses: { received: 1, overdue: 1, confirmed: 1, pending: 1 },
      warnings: [],
    });
  });

  it("força validação TLS quando a URL ou o ambiente identifica staging", () => {
    const bySchema = databaseConnectionConfig(
      "mysql://user:pass@db.example.test/exclusive_club_staging"
    );
    const byEnvironment = databaseConnectionConfig(
      "mysql://user:pass@db.example.test/exclusive_club",
      { NODE_ENV: "staging" }
    );

    expect(bySchema).toMatchObject({ ssl: { rejectUnauthorized: true } });
    expect(byEnvironment).toMatchObject({ ssl: { rejectUnauthorized: true } });
  });
});

describe("runReconciliation — execução em processo (sem child_process)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pagina customers/payments e devolve o relatório agregado, sem banco", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL | string) => {
        const parsed = new URL(String(url));
        const resource = parsed.pathname.split("/").pop();
        const offset = Number(parsed.searchParams.get("offset"));
        calls.push(`${resource}:${offset}`);
        if (resource === "customers") {
          return offset === 0
            ? jsonPage([{ id: "cus_1", email: "a@x.test" }], true)
            : jsonPage([{ id: "cus_2", email: "b@x.test" }], false);
        }
        return offset === 0
          ? jsonPage(
              [{ id: "pay_1", customer: "cus_1", status: "RECEIVED", value: 10 }],
              true
            )
          : jsonPage(
              [{ id: "pay_2", customer: "cus_2", status: "OVERDUE", value: 20 }],
              false
            );
      })
    );

    const report = await runReconciliation({
      apiKey: "test-key",
      pageTimeoutMs: 5_000,
    });

    expect(report.mode).toBe("dry-run");
    expect(report.customers.total).toBe(2);
    expect(report.payments.total).toBe(2);
    // Sem databaseUrl, não há estado local carregado — tudo fica sem vínculo.
    expect(report.payments.unmatchedLocalClients).toBe(2);
    expect(report.payments.matchedLocalClients).toBe(0);
    expect(calls).toEqual([
      "customers:0",
      "customers:1",
      "payments:0",
      "payments:1",
    ]);
  });

  it("nunca chama a API quando a chave está ausente", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      runReconciliation({ apiKey: "", pageTimeoutMs: 5_000 })
    ).rejects.toThrow(/ASAAS_API_KEY/);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("interrompe com 'tempo limite total' quando o signal já chegou abortado", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const controller = new AbortController();
    controller.abort();

    await expect(
      runReconciliation({
        apiKey: "test-key",
        pageTimeoutMs: 5_000,
        signal: controller.signal,
      })
    ).rejects.toThrow(/tempo limite total/);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
