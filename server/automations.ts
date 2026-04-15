import { getDb } from "./db";
import { allowedClients } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";
import { sql } from "drizzle-orm";

// NOTA: subscriptions e subscriptionCharges foram removidas do schema.
// O BPO agora usa bpo_charges como tabela central (importado do Asaas via bpoRouter.importFromAsaas).
// As automações abaixo foram adaptadas para usar bpo_charges.

/**
 * AUTOMAÇÃO 1: Geração Automática de Mensalidades
 * 
 * DESATIVADA — O sistema agora importa cobranças diretamente do Asaas via bpoRouter.importFromAsaas.
 * Use o botão "Importar Histórico" ou "Sincronizar" no BPO Financeiro.
 */
export async function generateMonthlyCharges() {
  console.log("[Automação] generateMonthlyCharges desativada — use bpoRouter.importFromAsaas");
  return { success: true, generated: 0, skipped: 0 };
}

/**
 * AUTOMAÇÃO 2: Alerta de Inadimplência
 * 
 * Execução sugerida: Diariamente às 08:00
 * 
 * Função: Notifica o proprietário sobre cobranças vencidas no bpo_charges.
 */
export async function sendOverdueAlerts() {
  const db = await getDb();
  if (!db) {
    console.error("[Automação] Database não disponível");
    return { success: false, error: "Database não disponível" };
  }

  try {
    const today = new Date().toISOString().split("T")[0];

    const [overdueRows] = (await db.execute(sql.raw(`
      SELECT b.id, b.client_name, b.client_email, b.value, b.due_date
      FROM bpo_charges b
      WHERE (b.status = 'overdue' OR (b.status = 'pending' AND b.due_date < '${today}'))
        AND b.due_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      ORDER BY b.due_date ASC
      LIMIT 50
    `))) as any;

    const overdueCharges = Array.isArray(overdueRows) ? overdueRows : [];

    if (overdueCharges.length > 0) {
      const clientList = overdueCharges.map((item: any) =>
        `- ${item.client_name || item.client_email || "Desconhecido"}: R$ ${parseFloat(item.value).toFixed(2)} - Vencimento: ${item.due_date}`
      ).join("\n");

      const message = `🚨 ALERTA DE INADIMPLÊNCIA\n\n${overdueCharges.length} cobrança(s) vencida(s):\n\n${clientList}`;

      await notifyOwner({
        title: "Inadimplência Detectada",
        content: message,
      });

      console.log(`[Automação] Alerta enviado: ${overdueCharges.length} inadimplentes`);
      return { success: true, count: overdueCharges.length };
    }

    console.log("[Automação] Nenhuma inadimplência detectada");
    return { success: true, count: 0 };
  } catch (error) {
    console.error("[Automação] Erro ao enviar alertas:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * AUTOMAÇÃO 3: Envio de Relatório Mensal
 * 
 * Execução sugerida: Primeiro dia do mês às 08:00
 * 
 * Função: Gera e envia relatório consolidado do mês anterior ao proprietário.
 */
export async function sendMonthlyReport() {
  const db = await getDb();
  if (!db) {
    console.error("[Automação] Database não disponível");
    return { success: false, error: "Database não disponível" };
  }

  try {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = lastMonth.toISOString().slice(0, 7);

    const [rows] = (await db.execute(sql.raw(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status IN ('received','confirmed','receivedInCash') THEN 1 ELSE 0 END) as paid_count,
        SUM(CASE WHEN status = 'overdue' OR (status = 'pending' AND due_date < CURDATE()) THEN 1 ELSE 0 END) as overdue_count,
        COALESCE(SUM(CASE WHEN status IN ('received','confirmed','receivedInCash') THEN CAST(amount_paid AS DECIMAL(10,2)) ELSE 0 END), 0) as revenue,
        COALESCE(SUM(CASE WHEN status = 'overdue' OR (status = 'pending' AND due_date < CURDATE()) THEN CAST(value AS DECIMAL(10,2)) ELSE 0 END), 0) as overdue_value
      FROM bpo_charges
      WHERE due_date LIKE '${lastMonthStr}-%'
    `))) as any;

    const r = Array.isArray(rows) ? rows[0] : rows;
    const total = parseInt(r?.total ?? "0");
    const paidCount = parseInt(r?.paid_count ?? "0");
    const overdueCount = parseInt(r?.overdue_count ?? "0");
    const revenue = parseFloat(r?.revenue ?? "0");
    const overdueValue = parseFloat(r?.overdue_value ?? "0");

    const message = `📊 RELATÓRIO MENSAL - ${lastMonthStr}\n\n` +
      `Total de Cobranças: ${total}\n` +
      `Cobranças Pagas: ${paidCount}\n` +
      `Cobranças Vencidas: ${overdueCount}\n\n` +
      `Receita Total: R$ ${revenue.toFixed(2)}\n` +
      `Valor em Atraso: R$ ${overdueValue.toFixed(2)}\n\n` +
      `Taxa de Inadimplência: ${total > 0 ? ((overdueCount / total) * 100).toFixed(1) : 0}%`;

    await notifyOwner({
      title: `Relatório Mensal - ${lastMonthStr}`,
      content: message,
    });

    console.log(`[Automação] Relatório mensal enviado: ${lastMonthStr}`);
    return { success: true, month: lastMonthStr };
  } catch (error) {
    console.error("[Automação] Erro ao enviar relatório:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * AUTOMAÇÃO 4: Webhook para Sincronização de Pagamentos Asaas
 * 
 * Endpoint: POST /api/webhooks/asaas
 * 
 * Função: Recebe notificações do Asaas sobre mudanças de status de pagamento
 * e atualiza automaticamente as cobranças no bpo_charges.
 * 
 * NOTA: Esta função é mantida para compatibilidade, mas o handler principal
 * está em server/_core/index.ts (app.post('/api/webhooks/asaas', ...))
 */
export async function handleAsaasWebhook(payload: any) {
  const db = await getDb();
  if (!db) {
    console.error("[Webhook] Database não disponível");
    return { success: false, error: "Database não disponível" };
  }

  try {
    const { event, payment } = payload;
    if (!payment?.id) {
      console.error("[Webhook] Payload inválido:", payload);
      return { success: false, error: "Payload inválido" };
    }

    console.log(`[Webhook] Evento ${event} para pagamento ${payment.id} — processado pelo handler principal`);
    return { success: true, event, paymentId: payment.id };
  } catch (error) {
    console.error("[Webhook] Erro ao processar webhook:", error);
    return { success: false, error: String(error) };
  }
}
