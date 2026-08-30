import { describe, expect, it, vi } from "vitest";

import {
  AsaasStagingDryRunAlreadyRunningError,
  createAsaasStagingDryRunController,
  stagingConnectionUrl,
  summarizeReport,
} from "./asaasStagingDryRun";

describe("stagingConnectionUrl", () => {
  it("recusa quando STAGING_DATABASE_URL não está configurada", () => {
    expect(() => stagingConnectionUrl({})).toThrow("Conexão de staging indisponível");
  });

  it("recusa quando a conexão de staging é igual à conexão ativa", () => {
    const url = "mysql://user:pass@host/exclusive_club_staging";
    expect(() =>
      stagingConnectionUrl({ STAGING_DATABASE_URL: url, DATABASE_URL: url })
    ).toThrow("A conexão de staging não pode ser a conexão ativa");
  });

  it("recusa protocolo que não seja mysql/mysqls", () => {
    expect(() =>
      stagingConnectionUrl({
        STAGING_DATABASE_URL: "postgres://user:pass@host/exclusive_club_staging",
      })
    ).toThrow("Protocolo de staging inválido");
  });

  it("recusa quando o schema não está identificado como staging", () => {
    expect(() =>
      stagingConnectionUrl({
        STAGING_DATABASE_URL: "mysql://user:pass@host/exclusive_club",
      })
    ).toThrow("não está identificado como staging");
  });

  it("aceita uma URL de staging válida e distinta da ativa", () => {
    const result = stagingConnectionUrl({
      STAGING_DATABASE_URL: "mysql://user:pass@host/exclusive_club_staging_restore",
      DATABASE_URL: "mysql://user:pass@host/exclusive_club",
    });
    expect(result).toContain("exclusive_club_staging_restore");
  });
});

describe("summarizeReport", () => {
  it("rejeita relatório fora do formato esperado", () => {
    expect(() => summarizeReport({ mode: "apply" })).toThrow(
      "Relatório de dry-run inválido"
    );
  });

  it("reduz o relatório a agregados seguros, sem PII", () => {
    const summary = summarizeReport({
      mode: "dry-run",
      customers: { total: 3 },
      payments: { total: 5, matchedLocalClients: 2, unmatchedLocalClients: 3 },
      warnings: ["cliente@exemplo.test sem vínculo", "outro aviso"],
      statuses: { received: 1 },
    });

    expect(summary).toEqual({
      mode: "dry-run",
      customers: { total: 3 },
      payments: { total: 5, matchedLocalClients: 2, unmatchedLocalClients: 3 },
      warnings: { total: 2 },
    });
  });
});

describe("createAsaasStagingDryRunController", () => {
  it("começa idle e vai para completed após o run injetado resolver", async () => {
    const controller = createAsaasStagingDryRunController(async () => ({
      completed: true,
      report: {
        mode: "dry-run",
        customers: { total: 1 },
        payments: { total: 1, matchedLocalClients: 1, unmatchedLocalClients: 0 },
        warnings: { total: 0 },
      },
    }));

    expect(controller.getStatus()).toEqual({ status: "idle" });

    const started = controller.start();
    expect(started.status).toBe("running");

    await vi.waitFor(() => {
      expect(controller.getStatus().status).not.toBe("running");
    });

    expect(controller.getStatus()).toMatchObject({ status: "completed" });
  });

  it("vai para failed quando o run injetado devolve falha estruturada", async () => {
    const controller = createAsaasStagingDryRunController(async () => ({
      completed: false,
      failure: {
        stage: "pagamentos",
        type: "http",
        pagesStarted: 2,
        lastOffset: 100,
      },
    }));

    controller.start();
    await vi.waitFor(() => {
      expect(controller.getStatus().status).not.toBe("running");
    });

    expect(controller.getStatus()).toEqual({
      status: "failed",
      result: { stage: "pagamentos", type: "http", pagesStarted: 2, lastOffset: 100 },
    });
  });

  it("vai para failed com valores seguros quando o run injetado rejeita inesperadamente", async () => {
    const controller = createAsaasStagingDryRunController(async () => {
      throw new Error("erro inesperado, nunca deve vazar detalhe sensível");
    });

    controller.start();
    await vi.waitFor(() => {
      expect(controller.getStatus().status).not.toBe("running");
    });

    expect(controller.getStatus()).toEqual({
      status: "failed",
      result: { stage: "inicializacao", type: "processo", pagesStarted: 0, lastOffset: null },
    });
  });

  it("rejeita uma segunda execução enquanto a primeira está em andamento", async () => {
    let resolveRun: (() => void) | undefined;
    const controller = createAsaasStagingDryRunController(
      () =>
        new Promise(resolve => {
          resolveRun = () =>
            resolve({
              completed: true,
              report: {
                mode: "dry-run",
                customers: { total: 0 },
                payments: { total: 0, matchedLocalClients: 0, unmatchedLocalClients: 0 },
                warnings: { total: 0 },
              },
            });
        })
    );

    controller.start();
    expect(() => controller.start()).toThrow(AsaasStagingDryRunAlreadyRunningError);

    resolveRun?.();
    await vi.waitFor(() => {
      expect(controller.getStatus().status).not.toBe("running");
    });

    // Depois que o job em andamento terminou, uma nova execução é permitida.
    expect(() => controller.start()).not.toThrow();
  });
});
