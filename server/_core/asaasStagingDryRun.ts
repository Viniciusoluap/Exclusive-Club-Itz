import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SCRIPT_TIMEOUT_MS = 900_000;

type DryRunReport = {
  mode: "dry-run";
  customers: { total: number };
  payments: {
    total: number;
    matchedLocalClients: number;
    unmatchedLocalClients: number;
  };
  warnings: { total: number };
};

type DryRunFailure = {
  stage: "inicializacao" | "clientes" | "pagamentos" | "staging";
  type: "timeout_total" | "timeout_page" | "http" | "staging" | "processo";
  pagesStarted: number;
  lastOffset: number | null;
};

type DryRunOutcome =
  | { completed: true; report: DryRunReport }
  | { completed: false; failure: DryRunFailure };

export type AsaasStagingDryRunStatus =
  | { status: "idle" }
  | { status: "running"; startedAt: string }
  | { status: "completed"; result: DryRunReport }
  | { status: "failed"; result: DryRunFailure };

export class AsaasStagingDryRunAlreadyRunningError extends Error {
  constructor() {
    super("Já existe um dry-run Asaas em andamento");
    this.name = "AsaasStagingDryRunAlreadyRunningError";
  }
}

function safeCount(value: unknown): number {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? Math.trunc(count) : 0;
}

export function stagingConnectionUrl(env = process.env): string {
  const rawUrl = env.STAGING_DATABASE_URL;
  if (!rawUrl) throw new Error("Conexão de staging indisponível");
  const url = new URL(rawUrl);
  if (
    env.DATABASE_URL &&
    url.toString() === new URL(env.DATABASE_URL).toString()
  ) {
    throw new Error("A conexão de staging não pode ser a conexão ativa");
  }
  if (!/^mysqls?:$/.test(url.protocol)) {
    throw new Error("Protocolo de staging inválido");
  }
  if (!/staging/i.test(url.pathname)) {
    throw new Error("O schema informado não está identificado como staging");
  }
  return url.toString();
}

function failed(
  stage: DryRunFailure["stage"] = "inicializacao",
  type: DryRunFailure["type"] = "processo",
  pagesStarted = 0,
  lastOffset: number | null = null
): DryRunFailure {
  return { stage, type, pagesStarted, lastOffset };
}

export function summarizeReport(value: unknown): DryRunReport {
  const report = value as {
    mode?: unknown;
    customers?: { total?: unknown };
    payments?: {
      total?: unknown;
      matchedLocalClients?: unknown;
      unmatchedLocalClients?: unknown;
    };
    warnings?: unknown;
  };
  if (
    report.mode !== "dry-run" ||
    !report.customers ||
    !report.payments ||
    !Array.isArray(report.warnings)
  ) {
    throw new Error("Relatório de dry-run inválido");
  }

  return {
    mode: "dry-run",
    customers: { total: safeCount(report.customers.total) },
    payments: {
      total: safeCount(report.payments.total),
      matchedLocalClients: safeCount(report.payments.matchedLocalClients),
      unmatchedLocalClients: safeCount(report.payments.unmatchedLocalClients),
    },
    // Só a contagem é exposta. O texto pode conter contexto de cliente.
    warnings: { total: report.warnings.length },
  };
}

async function executeDryRun(): Promise<DryRunOutcome> {
  const reportPath = path.join(
    os.tmpdir(),
    `exclusive-club-asaas-dry-run-${randomUUID()}.json`
  );
  const scriptPath = path.resolve(process.cwd(), "scripts", "asaas_rebuild.mjs");

  try {
    const databaseUrl = stagingConnectionUrl();
    const outcome = await new Promise<{
      exitCode: number;
      timedOut: boolean;
      stage: DryRunFailure["stage"];
      type: DryRunFailure["type"];
      pagesStarted: number;
      lastOffset: number | null;
    }>(resolve => {
      let timedOut = false;
      let pagesStarted = 0;
      let stage: DryRunFailure["stage"] = "inicializacao";
      let type: DryRunFailure["type"] = "processo";
      let lastOffset: number | null = null;
      let stdout = "";
      let settled = false;
      const finish = (exitCode: number) => {
        if (settled) return;
        settled = true;
        resolve({ exitCode, timedOut, stage, type, pagesStarted, lastOffset });
      };
      // A lista de argumentos contém apenas o script: este caminho jamais
      // aceita ou acrescenta --apply.
      const child = spawn(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: "staging",
          DATABASE_URL: databaseUrl,
          ASAAS_REBUILD_REPORT: reportPath,
          ASAAS_REBUILD_TLS: "true",
          ASAAS_PAGE_TIMEOUT_MS: "20000",
          ASAAS_REBUILD_PROGRESS: "true",
        },
        stdio: ["ignore", "pipe", "ignore"],
      });
      child.stdout?.on("data", chunk => {
        stdout += String(chunk);
        const lines = stdout.split("\n");
        stdout = lines.pop() ?? "";
        for (const line of lines) {
          try {
            const event = JSON.parse(line) as {
              event?: string;
              resource?: string;
              stage?: string;
              kind?: DryRunFailure["type"];
              offset?: number;
            };
            if (event.event === "page") {
              pagesStarted += 1;
              lastOffset = Number.isFinite(event.offset)
                ? Number(event.offset)
                : lastOffset;
              if (event.resource === "customers") stage = "clientes";
              if (event.resource === "payments") stage = "pagamentos";
            }
            if (event.event === "error") {
              if (
                event.stage === "clientes" ||
                event.stage === "pagamentos" ||
                event.stage === "staging"
              ) {
                stage = event.stage;
              }
              if (
                event.kind === "timeout_total" ||
                event.kind === "timeout_page" ||
                event.kind === "http" ||
                event.kind === "staging" ||
                event.kind === "processo"
              ) {
                type = event.kind;
              }
            }
          } catch {
            // Saída não estruturada nunca é persistida nem devolvida ao painel.
          }
        }
      });
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => finish(1), 5_000);
      }, SCRIPT_TIMEOUT_MS);
      child.once("error", () => {
        clearTimeout(timeout);
        finish(1);
      });
      child.once("exit", code => {
        clearTimeout(timeout);
        finish(code ?? 1);
      });
    });

    if (outcome.exitCode !== 0) {
      return {
        completed: false,
        failure: failed(
          outcome.stage,
          outcome.timedOut ? "timeout_total" : outcome.type,
          outcome.pagesStarted,
          outcome.lastOffset
        ),
      };
    }

    try {
      const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
      return { completed: true, report: summarizeReport(report) };
    } catch {
      return { completed: false, failure: failed("staging", "processo") };
    }
  } catch {
    return { completed: false, failure: failed() };
  } finally {
    await fs.unlink(reportPath).catch(() => undefined);
  }
}

export function createAsaasStagingDryRunController(
  run: () => Promise<DryRunOutcome> = executeDryRun
) {
  let latestStatus: AsaasStagingDryRunStatus = { status: "idle" };
  let activeRun: Promise<void> | null = null;

  return {
    start(): AsaasStagingDryRunStatus {
      if (activeRun) throw new AsaasStagingDryRunAlreadyRunningError();

      latestStatus = { status: "running", startedAt: new Date().toISOString() };
      activeRun = run()
        .then(outcome => {
          latestStatus = outcome.completed
            ? { status: "completed", result: outcome.report }
            : { status: "failed", result: outcome.failure };
        })
        .catch(() => {
          latestStatus = { status: "failed", result: failed() };
        })
        .finally(() => {
          activeRun = null;
        });
      return latestStatus;
    },

    getStatus(): AsaasStagingDryRunStatus {
      return latestStatus;
    },
  };
}

const controller = createAsaasStagingDryRunController();

export function startAsaasStagingDryRun(): AsaasStagingDryRunStatus {
  return controller.start();
}

export function getAsaasStagingDryRunStatus(): AsaasStagingDryRunStatus {
  return controller.getStatus();
}
