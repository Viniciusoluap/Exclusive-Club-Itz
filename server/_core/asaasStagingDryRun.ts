import { runReconciliation } from "../../scripts/asaas_rebuild.mjs";
import { resolveAsaasApiKey } from "./asaas";

const RUN_TIMEOUT_MS = 900_000;
const PAGE_TIMEOUT_MS = 20_000;

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

function classifyErrorType(
  stage: DryRunFailure["stage"],
  error: unknown
): DryRunFailure["type"] {
  const message = String((error as Error)?.message || "");
  if (message.includes("tempo limite total")) return "timeout_total";
  if (message.includes("tempo limite por página")) return "timeout_page";
  if (message.includes("HTTP")) return "http";
  if (stage === "staging") return "staging";
  return "processo";
}

/**
 * Roda a reconciliação diretamente no processo do servidor (sem
 * child_process/spawn): a chave é resolvida via resolveAsaasApiKey()
 * (env -> Configurações internas) e mantida só em memória, e a conexão
 * usa exclusivamente STAGING_DATABASE_URL com TLS. Este caminho nunca
 * aceita --apply — o modo dry-run é fixo, sem parâmetro que o altere.
 */
async function executeDryRun(): Promise<DryRunOutcome> {
  let pagesStarted = 0;
  let lastOffset: number | null = null;
  let stage: DryRunFailure["stage"] = "inicializacao";
  let type: DryRunFailure["type"] = "processo";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RUN_TIMEOUT_MS);

  try {
    const apiKey = await resolveAsaasApiKey();
    if (!apiKey) {
      return { completed: false, failure: failed("inicializacao", "processo") };
    }

    const databaseUrl = stagingConnectionUrl();

    const report = await runReconciliation({
      apiKey,
      databaseUrl,
      apply: false,
      pageTimeoutMs: PAGE_TIMEOUT_MS,
      signal: controller.signal,
      onProgress: (resource: string, offset: number) => {
        pagesStarted += 1;
        lastOffset = Number.isFinite(offset) ? offset : lastOffset;
        if (resource === "customers") stage = "clientes";
        if (resource === "payments") stage = "pagamentos";
      },
      onError: (failureStage: DryRunFailure["stage"], error: Error) => {
        stage = failureStage;
        type = classifyErrorType(failureStage, error);
      },
    });

    return { completed: true, report: summarizeReport(report) };
  } catch {
    return {
      completed: false,
      failure: failed(stage, type, pagesStarted, lastOffset),
    };
  } finally {
    clearTimeout(timeout);
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
