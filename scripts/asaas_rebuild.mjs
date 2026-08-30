#!/usr/bin/env node
/**
 * Reconstrução financeira segura: Asaas -> asaas_customers + bpo_charges.
 *
 * Uso:
 *   node scripts/asaas_rebuild.mjs                 # dry-run, sem escritas
 *   node scripts/asaas_rebuild.mjs --apply        # aplica upserts, nunca DELETE
 *
 * Segurança:
 * - A chave vem apenas de ASAAS_API_KEY (não aceita segredo em argumento).
 * - Dry-run é o padrão.
 * - Não apaga registros, não altera classificações manuais e não cria acesso em
 *   allowed_clients para toda pessoa que apareça no Asaas.
 * - O cadastro `asaas_customers` e as cobranças `bpo_charges` são atualizados
 *   por IDs externos, tornando reexecuções idempotentes.
 */
import mysql from "mysql2/promise";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const API_URL = (
  process.env.ASAAS_API_URL || "https://api.asaas.com/v3"
).replace(/\/$/, "");
const DATABASE_URL = process.env.DATABASE_URL;
const API_KEY = process.env.ASAAS_API_KEY;
const APPLY = process.argv.includes("--apply");
const PAGE_SIZE = 100;
const WAIT_MS = 180;
const configuredPageTimeout = Number(process.env.ASAAS_PAGE_TIMEOUT_MS || 20_000);
const PAGE_TIMEOUT_MS = Number.isFinite(configuredPageTimeout)
  ? Math.min(Math.max(configuredPageTimeout, 1_000), 30_000)
  : 20_000;
const REPORT_PROGRESS = process.env.ASAAS_REBUILD_PROGRESS === "true";
const outputPath =
  process.env.ASAAS_REBUILD_REPORT ||
  path.resolve("recovery/asaas-rebuild-report.json");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function reportProgress(resource, offset) {
  if (!REPORT_PROGRESS) return;
  process.stdout.write(`${JSON.stringify({ event: "page", resource, offset })}\n`);
}

function reportFailure(stage, error) {
  if (!REPORT_PROGRESS) return;
  const message = String(error?.message || "");
  const kind = message.includes("tempo limite por página")
    ? "timeout_page"
    : message.includes("HTTP")
      ? "http"
      : stage === "staging"
        ? "staging"
        : "processo";
  process.stdout.write(`${JSON.stringify({ event: "error", stage, kind })}\n`);
}

function normalizeStatus(status) {
  switch (String(status || "").toUpperCase()) {
    case "RECEIVED":
    case "DUNNING_RECEIVED":
      return "received";
    case "CONFIRMED":
      return "confirmed";
    case "RECEIVED_IN_CASH":
      return "receivedInCash";
    case "OVERDUE":
    case "DUNNING_REQUESTED":
      return "overdue";
    case "REFUNDED":
    case "REFUND_REQUESTED":
      return "refunded";
    case "AWAITING_CHARGEBACK_REVERSAL":
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
      return "awaitingChargeback";
    case "DETACHED":
      return "detached";
    case "PARTIALLY_PAID":
      return "partiallyPaid";
    case "CANCELLED":
    case "DELETED":
      return "cancelled";
    default:
      return "pending";
  }
}

function isPaid(status) {
  return ["received", "confirmed", "receivedInCash"].includes(status);
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function buildHeaders(apiKey) {
  if (!apiKey)
    throw new Error(
      "ASAAS_API_KEY não configurada; nenhum dado foi lido ou escrito."
    );
  return { accept: "application/json", access_token: apiKey };
}

async function fetchPage({ apiUrl, resource, offset, apiKey, pageTimeoutMs, onProgress, signal }) {
  const url = new URL(`${apiUrl}/${resource}`);
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("offset", String(offset));
  onProgress?.(resource, offset);
  if (signal?.aborted) {
    throw new Error(`Asaas ${resource}: tempo limite total`);
  }
  const controller = new AbortController();
  const onParentAbort = () => controller.abort();
  signal?.addEventListener("abort", onParentAbort);
  const timeout = setTimeout(() => controller.abort(), pageTimeoutMs);
  try {
    const response = await fetch(url, { headers: buildHeaders(apiKey), signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        `Asaas ${resource}: HTTP ${response.status} ${String(body?.errors?.[0]?.description || body?.message || "erro desconhecido").slice(0, 240)}`
      );
    }
    return body;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        signal?.aborted
          ? `Asaas ${resource}: tempo limite total`
          : `Asaas ${resource}: tempo limite por página`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onParentAbort);
  }
}

async function forEachPage({ apiUrl, resource, apiKey, pageTimeoutMs, onProgress, onRows, signal }) {
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const page = await fetchPage({ apiUrl, resource, offset, apiKey, pageTimeoutMs, onProgress, signal });
    const rows = Array.isArray(page.data) ? page.data : [];
    await onRows(rows);
    hasMore = Boolean(page.hasMore) && rows.length > 0;
    offset += rows.length || PAGE_SIZE;
    if (hasMore) await sleep(WAIT_MS);
  }
}

function customerRecord(customer) {
  return {
    id: customer.id,
    email: customer.email || "",
    name: customer.name || null,
    cpfCnpj: customer.cpfCnpj || null,
  };
}

function chargeRecord(charge, customer, localClient) {
  const status = normalizeStatus(charge.status);
  return {
    asaasChargeId: charge.id,
    asaasCustomerId: charge.customer || customer?.id || null,
    clientId: localClient?.id || null,
    clientName: customer?.name || localClient?.name || null,
    clientEmail: customer?.email || localClient?.email || null,
    value: safeNumber(charge.value).toFixed(2),
    netValue:
      charge.netValue == null ? null : safeNumber(charge.netValue).toFixed(2),
    amountPaid: isPaid(status) ? safeNumber(charge.value).toFixed(2) : "0.00",
    dueDate: charge.dueDate || new Date().toISOString().slice(0, 10),
    paidDate: charge.paymentDate || null,
    status,
    billingType: charge.billingType || null,
    description: charge.description || null,
    externalReference: charge.externalReference || null,
    paymentLink: charge.invoiceUrl || null,
    invoiceUrl: charge.invoiceUrl || null,
    bankSlipUrl: charge.bankSlipUrl || null,
    source: "asaas_import",
  };
}

export function createReport(mode = "dry-run") {
  return {
    mode,
    generatedAt: new Date().toISOString(),
    customers: { total: 0, inserted: 0, updated: 0 },
    payments: {
      total: 0,
      insertedOrUpdated: 0,
      matchedLocalClients: 0,
      unmatchedLocalClients: 0,
    },
    statuses: {},
    warnings: [],
  };
}

export async function processCustomerPage(
  customers,
  { report, customersById, applyCustomerRecord }
) {
  for (const customer of customers) {
    const normalized = customerRecord(customer);
    customersById.set(customer.id, normalized);
    report.customers.total += 1;
    if (applyCustomerRecord) {
      const action = await applyCustomerRecord(normalized);
      report.customers[action] += 1;
    }
  }
}

export async function processPaymentPage(
  payments,
  { report, customersById, localState, applyChargeRecord }
) {
  for (const payment of payments) {
    const customer =
      customersById.get(payment.customer) ||
      localState.customersById.get(payment.customer);
    const localClient = customer?.email
      ? localState.clientsByEmail.get(customer.email.trim().toLowerCase())
      : undefined;
    const normalized = chargeRecord(payment, customer, localClient);
    report.payments.total += 1;
    report.statuses[normalized.status] =
      (report.statuses[normalized.status] || 0) + 1;
    if (localClient) report.payments.matchedLocalClients += 1;
    else report.payments.unmatchedLocalClients += 1;
    if (applyChargeRecord) {
      await applyChargeRecord(normalized);
      report.payments.insertedOrUpdated += 1;
    }
  }
}

export function databaseConnectionConfig(databaseUrl, env = process.env) {
  const parsed = new URL(databaseUrl);
  const stagingMarker = `${parsed.hostname}${parsed.pathname}${parsed.search}`;
  const isStaging =
    env.NODE_ENV === "staging" ||
    env.ASAAS_REBUILD_TLS === "true" ||
    /staging/i.test(stagingMarker);
  return isStaging
    ? { uri: databaseUrl, ssl: { rejectUnauthorized: true } }
    : databaseUrl;
}

export async function loadLocalState(connection) {
  const [allowedClients] = await connection.query(
    "SELECT id, email, name FROM allowed_clients"
  );
  const [asaasCustomers] = await connection.query(
    "SELECT id, client_email, asaas_customer_id, name FROM asaas_customers"
  );
  const clientsByEmail = new Map(
    allowedClients.map(client => [
      String(client.email).trim().toLowerCase(),
      client,
    ])
  );
  const customersById = new Map(
    asaasCustomers.map(customer => [
      String(customer.asaas_customer_id),
      customer,
    ])
  );
  return { clientsByEmail, customersById };
}

/**
 * Executa a reconciliação inteira em processo — sem child_process, sem
 * arquivo temporário. Pensada para ser chamada diretamente por um painel
 * administrativo (ex.: server/_core/asaasStagingDryRun.ts), que já resolve
 * a chave via resolveAsaasApiKey() (env -> Configurações internas) e passa
 * o valor aqui em memória. Nunca lê process.env.ASAAS_API_KEY diretamente.
 */
export async function runReconciliation({
  apiKey,
  apiUrl = API_URL,
  databaseUrl,
  apply = false,
  pageTimeoutMs = PAGE_TIMEOUT_MS,
  onProgress,
  onError,
  signal,
} = {}) {
  if (!apiKey) {
    throw new Error(
      "ASAAS_API_KEY não configurada; nenhum dado foi lido ou escrito."
    );
  }

  let connection = null;
  try {
    let localState = { clientsByEmail: new Map(), customersById: new Map() };
    if (databaseUrl) {
      try {
        onProgress?.("staging", 0);
        connection = await mysql.createConnection(
          databaseConnectionConfig(databaseUrl)
        );
        localState = await loadLocalState(connection);
      } catch (error) {
        onError?.("staging", error);
        throw error;
      }
    }

    const report = createReport(apply ? "apply" : "dry-run");
    const customersById = new Map();

    try {
      await forEachPage({
        apiUrl,
        resource: "customers",
        apiKey,
        pageTimeoutMs,
        onProgress,
        signal,
        onRows: async customers => {
          await processCustomerPage(customers, {
            report,
            customersById,
            applyCustomerRecord:
              apply && connection
                ? customer => applyCustomer(connection, customer)
                : undefined,
          });
        },
      });
    } catch (error) {
      onError?.("clientes", error);
      throw error;
    }

    try {
      await forEachPage({
        apiUrl,
        resource: "payments",
        apiKey,
        pageTimeoutMs,
        onProgress,
        signal,
        onRows: async payments => {
          await processPaymentPage(payments, {
            report,
            customersById,
            localState,
            applyChargeRecord:
              apply && connection
                ? charge => applyCharge(connection, charge)
                : undefined,
          });
        },
      });
    } catch (error) {
      onError?.("pagamentos", error);
      throw error;
    }

    return report;
  } finally {
    // Roda em processo longevo (server), não em processo filho que encerra
    // sozinho — uma reconciliação que falha no meio precisa fechar a conexão
    // de staging do mesmo jeito que uma bem-sucedida, senão cada tentativa
    // falha deixa uma conexão aberta até estourar o limite do TiDB.
    if (connection) await connection.end().catch(() => undefined);
  }
}

async function applyCustomer(connection, customer) {
  const [existing] = await connection.query(
    "SELECT id FROM asaas_customers WHERE asaas_customer_id = ? LIMIT 1",
    [customer.id]
  );
  if (existing.length) {
    await connection.query(
      "UPDATE asaas_customers SET client_email = ?, cpf_cnpj = ?, name = ?, updated_at = NOW() WHERE id = ?",
      [
        customer.email || "",
        customer.cpfCnpj || null,
        customer.name || null,
        existing[0].id,
      ]
    );
    return "updated";
  }
  await connection.query(
    "INSERT INTO asaas_customers (client_email, asaas_customer_id, cpf_cnpj, name, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())",
    [
      customer.email || "",
      customer.id,
      customer.cpfCnpj || null,
      customer.name || null,
    ]
  );
  return "inserted";
}

async function applyCharge(connection, charge) {
  await connection.query(
    `INSERT INTO bpo_charges
      (asaas_charge_id, asaas_customer_id, client_id, client_name, client_email,
       value, net_value, amount_paid, due_date, paid_date, status, billing_type,
       description, external_reference, payment_link, invoice_url, bank_slip_url,
       source, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       asaas_customer_id = VALUES(asaas_customer_id),
       client_id = COALESCE(VALUES(client_id), client_id),
       client_name = COALESCE(VALUES(client_name), client_name),
       client_email = COALESCE(VALUES(client_email), client_email),
       value = VALUES(value),
       net_value = VALUES(net_value),
       amount_paid = VALUES(amount_paid),
       due_date = VALUES(due_date),
       paid_date = VALUES(paid_date),
       status = VALUES(status),
       billing_type = VALUES(billing_type),
       description = COALESCE(VALUES(description), description),
       external_reference = COALESCE(VALUES(external_reference), external_reference),
       payment_link = COALESCE(VALUES(payment_link), payment_link),
       invoice_url = COALESCE(VALUES(invoice_url), invoice_url),
       bank_slip_url = COALESCE(VALUES(bank_slip_url), bank_slip_url),
       source = 'asaas_reconcile',
       synced_at = NOW()`,
    [
      charge.asaasChargeId,
      charge.asaasCustomerId,
      charge.clientId,
      charge.clientName,
      charge.clientEmail,
      charge.value,
      charge.netValue,
      charge.amountPaid,
      charge.dueDate,
      charge.paidDate,
      charge.status,
      charge.billingType,
      charge.description,
      charge.externalReference,
      charge.paymentLink,
      charge.invoiceUrl,
      charge.bankSlipUrl,
      charge.source,
    ]
  );
}

async function main() {
  if (!API_KEY) {
    console.log(
      "DRY-RUN: ASAAS_API_KEY ausente. O script está pronto, mas não fará chamadas externas."
    );
    console.log(
      "Configure a chave somente no ambiente seguro e execute novamente; nunca passe a chave na linha de comando."
    );
    return;
  }
  if (!DATABASE_URL) {
    console.log(
      "DRY-RUN: DATABASE_URL ausente. A API pode ser lida para gerar um relatório, mas nenhum banco será alterado."
    );
  }

  const report = await runReconciliation({
    apiKey: API_KEY,
    apiUrl: API_URL,
    databaseUrl: DATABASE_URL,
    apply: APPLY,
    pageTimeoutMs: PAGE_TIMEOUT_MS,
    onProgress: REPORT_PROGRESS ? reportProgress : undefined,
    onError: REPORT_PROGRESS ? reportFailure : undefined,
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    JSON.stringify(report, null, 2) + "\n",
    "utf8"
  );
  console.log(JSON.stringify(report, null, 2));
  console.log(`Relatório salvo em ${outputPath}`);
  if (!APPLY)
    console.log(
      "Nenhuma escrita foi realizada. Para aplicar upserts sem DELETE, use --apply após revisar o relatório."
    );
}

const invokedPath = process.argv[1];
if (
  invokedPath &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
) {
  main().catch(error => {
    console.error(`Falha na reconstrução Asaas: ${error.message}`);
    process.exitCode = 1;
  });
}
