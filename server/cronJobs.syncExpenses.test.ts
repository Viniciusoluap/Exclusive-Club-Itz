import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { runSyncExpenses } from "./cronJobs";

/**
 * Story 11 (Fase 1, DB-22): prova que tx.id/tx.description vindos da API
 * Asaas (dado externo, "2ª ordem") não conseguem injetar SQL em
 * runSyncExpenses — antes eram interpolados direto em sql.raw(), agora usam
 * bind params (sql`` do drizzle). Contra o banco real, igual ao resto da
 * suíte de Fase 1 (db.transaction.test.ts, webhookAsaas.idempotency.test.ts):
 * o que importa é provar que o payload malicioso é armazenado como dado
 * literal, não executado como SQL.
 */
describe("runSyncExpenses - Story 11 (SQLi de 2ª ordem via API Asaas)", () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.ASAAS_API_KEY;
  const insertedPaymentIds: string[] = [];
  let canaryId: number | null = null;

  beforeEach(async () => {
    process.env.ASAAS_API_KEY = "$aact_hmlg_test_key_for_story11";

    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const [canaryResult] = (await db.execute(sql`
      INSERT INTO expense_records (cost_center, description, value, due_date, paid_date, status, source_type)
      VALUES ('other', 'Canário Story 11 — não deve ser afetado', 1.23, '2026-01-01', '2026-01-01', 'paid', 'manual')
    `)) as any;
    canaryId = canaryResult?.insertId ?? null;
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    process.env.ASAAS_API_KEY = originalApiKey;

    const db = await getDb();
    if (!db) return;
    if (insertedPaymentIds.length > 0) {
      const ids = sql.join(insertedPaymentIds.splice(0, insertedPaymentIds.length).map((id) => sql`${id}`), sql`, `);
      await db.execute(sql`DELETE FROM expense_records WHERE asaas_payment_id IN (${ids})`);
    }
    if (canaryId) {
      await db.execute(sql`DELETE FROM expense_records WHERE id = ${canaryId}`);
      canaryId = null;
    }
  });

  it("armazena payloads maliciosos de tx.id/tx.description como dado literal, sem executar SQL", async () => {
    const maliciousTransferId = `1'; DROP TABLE expense_records; --`;
    const maliciousTransferDesc = `Pagamento" OR "1"="1`;
    const maliciousFeeId = `2' OR '1'='1`;
    const maliciousFeeDesc = `Taxa'; DELETE FROM expense_records WHERE '1'='1`;
    const maliciousWithdrawalId = `3"; DROP TABLE users; --`;
    const maliciousWithdrawalDesc = `Saque\\'; --`;

    global.fetch = vi.fn(async (input: any) => {
      const url = String(input);
      if (url.includes("/transfers")) {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: maliciousTransferId,
                status: "DONE",
                description: maliciousTransferDesc,
                value: 42.5,
                dateCreated: "2026-01-10",
              },
            ],
          }),
        } as any;
      }
      if (url.includes("/financialTransactions")) {
        return {
          ok: true,
          json: async () => ({
            data: [
              {
                id: maliciousFeeId,
                type: "PIX_FEE",
                description: maliciousFeeDesc,
                value: -3.5,
                date: "2026-01-10",
              },
              {
                id: maliciousWithdrawalId,
                type: "WITHDRAWAL",
                description: maliciousWithdrawalDesc,
                value: -100,
                date: "2026-01-10",
              },
            ],
          }),
        } as any;
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    }) as any;

    await expect(runSyncExpenses()).resolves.not.toThrow();

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const transferPaymentId = `transfer_${maliciousTransferId}`;
    const feePaymentId = `fee_${maliciousFeeId}`;
    const withdrawalPaymentId = `withdrawal_${maliciousWithdrawalId}`;
    insertedPaymentIds.push(transferPaymentId, feePaymentId, withdrawalPaymentId);

    const transferRows = (await db.execute(sql`
      SELECT description FROM expense_records WHERE asaas_payment_id = ${transferPaymentId}
    `)) as any;
    const transferRow = Array.isArray(transferRows[0]) ? transferRows[0][0] : transferRows[0];
    expect(transferRow).toBeDefined();
    expect(transferRow.description).toBe(maliciousTransferDesc);

    const feeRows = (await db.execute(sql`
      SELECT description FROM expense_records WHERE asaas_payment_id = ${feePaymentId}
    `)) as any;
    const feeRow = Array.isArray(feeRows[0]) ? feeRows[0][0] : feeRows[0];
    expect(feeRow).toBeDefined();
    expect(feeRow.description).toBe(maliciousFeeDesc);

    const withdrawalRows = (await db.execute(sql`
      SELECT description FROM expense_records WHERE asaas_payment_id = ${withdrawalPaymentId}
    `)) as any;
    const withdrawalRow = Array.isArray(withdrawalRows[0]) ? withdrawalRows[0][0] : withdrawalRows[0];
    expect(withdrawalRow).toBeDefined();
    expect(withdrawalRow.description).toBe(maliciousWithdrawalDesc);

    // Prova mais forte que "não lançou exceção": a tabela não foi derrubada
    // e o canário sobrevive intacto — se algum payload tivesse escapado do
    // bind param e sido executado como SQL, isto teria sumido ou explodido.
    const canaryRows = (await db.execute(sql`
      SELECT description FROM expense_records WHERE id = ${canaryId}
    `)) as any;
    const canaryRow = Array.isArray(canaryRows[0]) ? canaryRows[0][0] : canaryRows[0];
    expect(canaryRow?.description).toBe("Canário Story 11 — não deve ser afetado");
  });
});
