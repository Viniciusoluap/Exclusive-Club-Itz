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

const API_URL = (
  process.env.ASAAS_API_URL || "https://api.asaas.com/v3"
).replace(/\/$/, "");
const DATABASE_URL = process.env.DATABASE_URL;
const API_KEY = process.env.ASAAS_API_KEY;
const APPLY = process.argv.includes("--apply");
const PAGE_SIZE = 100;
const WAIT_MS = 180;
const outputPath =
  process.env.ASAAS_REBUILD_REPORT ||
  path.resolve("recovery/asaas-rebuild-report.json");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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

function buildHeaders() {
  if (!API_KEY)
    throw new Error(
      "ASAAS_API_KEY não configurada; nenhum dado foi lido ou escrito."
    );
  return { accept: "application/json", access_token: API_KEY };
}

async function fetchPage(resource, offset) {
  const url = new URL(`${API_URL}/${resource}`);
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("offset", String(offset));
  const response = await fetch(url, { headers: buildHeaders() });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Asaas ${resource}: HTTP ${response.status} ${String(body?.errors?.[0]?.description || body?.message || "erro desconhecido").slice(0, 240)}`
    );
  }
  return body;
}

async function fetchAll(resource) {
  const rows = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const page = await fetchPage(resource, offset);
    const data = Array.isArray(page.data) ? page.data : [];
    rows.push(...data);
    hasMore = Boolean(page.hasMore) && data.length > 0;
    offset += data.length || PAGE_SIZE;
    if (hasMore) await sleep(WAIT_MS);
  }
  return rows;
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

async function loadLocalState(connection) {
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

  const customers = await fetchAll("customers");
  const payments = await fetchAll("payments");
  const customersById = new Map(
    customers.map(customer => [customer.id, customerRecord(customer)])
  );
  let connection = null;
  let localState = { clientsByEmail: new Map(), customersById: new Map() };
  if (DATABASE_URL) {
    connection = await mysql.createConnection(DATABASE_URL);
    localState = await loadLocalState(connection);
  }

  const report = {
    mode: APPLY ? "apply" : "dry-run",
    generatedAt: new Date().toISOString(),
    customers: { total: customers.length, inserted: 0, updated: 0 },
    payments: {
      total: payments.length,
      insertedOrUpdated: 0,
      matchedLocalClients: 0,
      unmatchedLocalClients: 0,
    },
    statuses: {},
    warnings: [],
  };

  for (const customer of customers) {
    const normalized = customerRecord(customer);
    if (APPLY && connection) {
      const action = await applyCustomer(connection, normalized);
      report.customers[action] += 1;
    }
  }

  for (const payment of payments) {
    const customer =
      customersById.get(payment.customer) ||
      localState.customersById.get(payment.customer);
    const localClient = customer?.email
      ? localState.clientsByEmail.get(customer.email.trim().toLowerCase())
      : undefined;
    const normalized = chargeRecord(payment, customer, localClient);
    report.statuses[normalized.status] =
      (report.statuses[normalized.status] || 0) + 1;
    if (localClient) report.payments.matchedLocalClients += 1;
    else report.payments.unmatchedLocalClients += 1;
    if (APPLY && connection) {
      await applyCharge(connection, normalized);
      report.payments.insertedOrUpdated += 1;
    }
  }

  if (connection) await connection.end();
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

main().catch(error => {
  console.error(`Falha na reconstrução Asaas: ${error.message}`);
  process.exitCode = 1;
});
