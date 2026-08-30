import { describe, expect, it, vi } from "vitest";

import {
  AsaasStagingDryRunAlreadyRunningError,
  createAsaasStagingDryRunController,
  stagingConnectionUrl,
  summarizeReport,
} from "./_core/asaasStagingDryRun";

describe("job administrativo de dry-run Asaas", () => {
  it("faz idle → running → completed e bloqueia execução concorrente", async () => {
    let finish!: (value: {
      completed: true;
      report: {
        mode: "dry-run";
        customers: { total: number };
        payments: {
          total: number;
          matchedLocalClients: number;
          unmatchedLocalClients: number;
        };
        warnings: { total: number };
      };
    }) => void;
    const execution = new Promise<Parameters<typeof finish>[0]>(resolve => {
      finish = resolve;
    });
    const controller = createAsaasStagingDryRunController(() => execution);

    expect(controller.getStatus()).toEqual({ status: "idle" });
    expect(controller.start().status).toBe("running");
    expect(() => controller.start()).toThrow(AsaasStagingDryRunAlreadyRunningError);

    finish({
      completed: true,
      report: {
        mode: "dry-run",
        customers: { total: 2 },
        payments: {
          total: 3,
          matchedLocalClients: 1,
          unmatchedLocalClients: 2,
        },
        warnings: { total: 0 },
      },
    });

    await vi.waitFor(() => {
      expect(controller.getStatus()).toMatchObject({
        status: "completed",
        result: { mode: "dry-run", customers: { total: 2 } },
      });
    });
  });

  it("aceita somente STAGING_DATABASE_URL distinta e identificada como staging", () => {
    const staging = "mysql://user:pass@db.example.test/exclusive_club_staging";
    expect(stagingConnectionUrl({ STAGING_DATABASE_URL: staging })).toContain(
      "exclusive_club_staging"
    );
    expect(() =>
      stagingConnectionUrl({ STAGING_DATABASE_URL: staging, DATABASE_URL: staging })
    ).toThrow("não pode ser a conexão ativa");
    expect(() =>
      stagingConnectionUrl({
        STAGING_DATABASE_URL: "mysql://user:pass@db.example.test/exclusive_club",
      })
    ).toThrow("não está identificado como staging");
  });

  it("remove textos, nomes, e-mails e IDs do relatório devolvido", () => {
    const report = summarizeReport({
      mode: "dry-run",
      customers: { total: 1, raw: { name: "Nome Cliente" } },
      payments: {
        total: 1,
        matchedLocalClients: 1,
        unmatchedLocalClients: 0,
        ids: ["pay_123"],
      },
      warnings: ["cliente@example.com não conciliado"],
    });

    expect(report).toEqual({
      mode: "dry-run",
      customers: { total: 1 },
      payments: {
        total: 1,
        matchedLocalClients: 1,
        unmatchedLocalClients: 0,
      },
      warnings: { total: 1 },
    });
    expect(JSON.stringify(report)).not.toMatch(/Nome Cliente|cliente@|pay_123/);
  });
});
