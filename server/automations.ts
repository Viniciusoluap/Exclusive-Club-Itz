import { getDb } from "./db";
import { subscriptions, subscriptionCharges, allowedClients } from "../drizzle/schema";
import { eq, and, lte, gte } from "drizzle-orm";
import { notifyOwner } from "./_core/notification";

/**
 * AUTOMAÇÃO 1: Geração Automática de Mensalidades
 * 
 * Execução sugerida: Diariamente às 00:00
 * 
 * Função: Gera cobranças mensais automaticamente para todas as assinaturas ativas
 * que ainda não possuem cobrança para o mês corrente.
 */
export async function generateMonthlyCharges() {
  const db = await getDb();
  if (!db) {
    console.error("[Automação] Database não disponível");
    return { success: false, error: "Database não disponível" };
  }

  try {
    // Buscar todas as assinaturas ativas
    const activeSubscriptions = await db.select()
      .from(subscriptions)
      .where(eq(subscriptions.status, 'active'));

    let generated = 0;
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7); // YYYY-MM

    for (const subscription of activeSubscriptions) {
      // Verificar se já existe cobrança para o mês corrente
      const existingCharge = await db.select()
        .from(subscriptionCharges)
        .where(
          and(
            eq(subscriptionCharges.subscriptionId, subscription.id),
            gte(subscriptionCharges.dueDate, `${currentMonth}-01`),
            lte(subscriptionCharges.dueDate, `${currentMonth}-31`)
          )
        )
        .limit(1);

      if (existingCharge.length === 0) {
        // Calcular data de vencimento (dia do mês da assinatura)
        const dueDay = subscription.dueDay;
        const dueDate = new Date(now.getFullYear(), now.getMonth(), dueDay);

        // Criar nova cobrança
        await db.insert(subscriptionCharges).values({
          subscriptionId: subscription.id,
          value: subscription.value.toString(),
          dueDate: dueDate.toISOString().split('T')[0],
          status: 'pending',
        });

        generated++;
      }
    }

    console.log(`[Automação] ${generated} mensalidades geradas`);
    return { success: true, generated };
  } catch (error) {
    console.error("[Automação] Erro ao gerar mensalidades:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * AUTOMAÇÃO 2: Envio de Alertas de Inadimplência
 * 
 * Execução sugerida: Diariamente às 09:00
 * 
 * Função: Identifica cobranças vencidas e envia notificação ao proprietário
 * com lista de inadimplentes.
 */
export async function sendOverdueAlerts() {
  const db = await getDb();
  if (!db) {
    console.error("[Automação] Database não disponível");
    return { success: false, error: "Database não disponível" };
  }

  try {
    const today = new Date().toISOString().split('T')[0];

    // Buscar cobranças vencidas
    const overdueCharges = await db.select({
      charge: subscriptionCharges,
      subscription: subscriptions,
      client: allowedClients,
    })
    .from(subscriptionCharges)
    .innerJoin(subscriptions, eq(subscriptionCharges.subscriptionId, subscriptions.id))
    .innerJoin(allowedClients, eq(subscriptions.clientId, allowedClients.id))
    .where(
      and(
        lte(subscriptionCharges.dueDate, today),
        eq(subscriptionCharges.status, 'pending')
      )
    );

    if (overdueCharges.length > 0) {
      // Montar mensagem
      const clientList = overdueCharges.map(item => 
        `- ${item.client.name} (${item.client.email}): R$ ${(parseFloat(item.charge.value) / 100).toFixed(2)} - Vencimento: ${item.charge.dueDate}`
      ).join('\n');

      const message = `🚨 ALERTA DE INADIMPLÊNCIA\n\n${overdueCharges.length} cobrança(s) vencida(s):\n\n${clientList}`;

      // Enviar notificação ao proprietário
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
    // Calcular mês anterior
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = lastMonth.toISOString().slice(0, 7);

    // Buscar métricas do mês anterior
    const totalCharges = await db.select()
      .from(subscriptionCharges)
      .where(
        and(
          gte(subscriptionCharges.dueDate, `${lastMonthStr}-01`),
          lte(subscriptionCharges.dueDate, `${lastMonthStr}-31`)
        )
      );

    const paidCharges = totalCharges.filter(c => c.status === 'paid');
    const overdueCharges = totalCharges.filter(c => c.status === 'overdue');

    const totalRevenue = paidCharges.reduce((sum, c) => sum + parseFloat(c.value), 0);
    const totalOverdue = overdueCharges.reduce((sum, c) => sum + parseFloat(c.value), 0);

    // Montar relatório
    const message = `📊 RELATÓRIO MENSAL - ${lastMonthStr}\n\n` +
      `Total de Cobranças: ${totalCharges.length}\n` +
      `Cobranças Pagas: ${paidCharges.length}\n` +
      `Cobranças Vencidas: ${overdueCharges.length}\n\n` +
      `Receita Total: R$ ${(totalRevenue / 100).toFixed(2)}\n` +
      `Valor em Atraso: R$ ${(totalOverdue / 100).toFixed(2)}\n\n` +
      `Taxa de Inadimplência: ${totalCharges.length > 0 ? ((overdueCharges.length / totalCharges.length) * 100).toFixed(1) : 0}%`;

    // Enviar notificação ao proprietário
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
 * e atualiza automaticamente as cobranças no sistema.
 */
export async function handleAsaasWebhook(payload: any) {
  const db = await getDb();
  if (!db) {
    console.error("[Webhook] Database não disponível");
    return { success: false, error: "Database não disponível" };
  }

  try {
    const { event, payment } = payload;

    if (!payment || !payment.externalReference) {
      console.error("[Webhook] Payload inválido:", payload);
      return { success: false, error: "Payload inválido" };
    }

    // externalReference deve conter o ID da cobrança
    const chargeId = parseInt(payment.externalReference);

    // Mapear status do Asaas para status do sistema
    let newStatus: 'pending' | 'paid' | 'overdue' | 'cancelled' = 'pending';
    
    switch (event) {
      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_CONFIRMED':
        newStatus = 'paid';
        break;
      case 'PAYMENT_OVERDUE':
        newStatus = 'overdue';
        break;
      case 'PAYMENT_DELETED':
        newStatus = 'cancelled';
        break;
    }

    // Atualizar status da cobrança
    await db.update(subscriptionCharges)
      .set({ 
        status: newStatus,
        asaasPaymentId: payment.id,
      })
      .where(eq(subscriptionCharges.id, chargeId));

    console.log(`[Webhook] Cobrança ${chargeId} atualizada para ${newStatus}`);
    return { success: true, chargeId, newStatus };
  } catch (error) {
    console.error("[Webhook] Erro ao processar webhook:", error);
    return { success: false, error: String(error) };
  }
}
