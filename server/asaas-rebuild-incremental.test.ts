import { describe, expect, it } from "vitest";

import {
  createReport,
  databaseConnectionConfig,
  processCustomerPage,
  processPaymentPage,
} from "../scripts/asaas_rebuild.mjs";

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
