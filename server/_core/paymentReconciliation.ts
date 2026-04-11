/**
 * Serviço de Reconciliação e Expiração de Pagamentos
 * 
 * Funcionalidades:
 * - Verificação periódica de status no Asaas
 * - Correção de divergências entre status local e Asaas
 * - Expiração automática de cobranças PIX
 * - Relatórios de reconciliação
 */
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import {
  getChargeStatus,
  mapAsaasStatus,
  mapToLegacyStatus,
  updatePaymentStatus,
  logPaymentAudit,
} from "./asaasService";

// Configurações
const PIX_EXPIRATION_MINUTES = 30; // Tempo de expiração do PIX
const RECONCILIATION_BATCH_SIZE = 50; // Quantos pagamentos verificar por vez

interface ReconciliationResult {
  id: number;
  totalChecked: number;
  totalDivergent: number;
  totalFixed: number;
  divergences: Array<{
    paymentId: number;
    asaasPaymentId: string;
    localStatus: string;
    asaasStatus: string;
    fixed: boolean;
  }>;
}

/**
 * Executa reconciliação de pagamentos pendentes
 * Compara status local com status no Asaas e corrige divergências
 */
export async function runReconciliation(runBy?: string): Promise<ReconciliationResult> {
  const db = await getDb();
  if (!db) {
    throw new Error('Database not available');
  }

  console.log('[Reconciliation] Iniciando reconciliação...');

  // Cria registro de reconciliação
  const insertResult = await db.execute(sql`
    INSERT INTO payment_reconciliations (status, run_by)
    VALUES ('running', ${runBy || null})
  `) as any;
  
  const reconciliationId = insertResult[0]?.insertId || 0;

  const result: ReconciliationResult = {
    id: reconciliationId,
    totalChecked: 0,
    totalDivergent: 0,
    totalFixed: 0,
    divergences: [],
  };

  try {
    // ═══════════════════════════════════════════════════════
    // FASE 2: Reconcilia subscription_charges com o Asaas
    // Verifica cobranças pendentes/vencidas no BPO Financeiro
    // ═══════════════════════════════════════════════════════
    const scPending = await db.execute(sql.raw(`
      SELECT id, asaas_payment_id, status
      FROM subscription_charges
      WHERE status IN ('pending', 'overdue')
      AND asaas_payment_id IS NOT NULL
      ORDER BY created_at ASC
      LIMIT ${RECONCILIATION_BATCH_SIZE}
    `)) as any;

    const scPayments = Array.isArray(scPending[0]) ? scPending[0] : [];
    console.log(`[Reconciliation] Verificando ${scPayments.length} subscription_charges pendentes...`);

    for (const sc of scPayments) {
      try {
        const asaasCharge = await getChargeStatus(sc.asaas_payment_id);
        if (!asaasCharge) continue;

        // Mapeia status Asaas para subscription_charges
        let scStatus: 'pending' | 'paid' | 'overdue' | 'cancelled' = 'pending';
        const asaasUpper = asaasCharge.status.toUpperCase();
        if (asaasUpper === 'RECEIVED' || asaasUpper === 'CONFIRMED') scStatus = 'paid';
        else if (asaasUpper === 'OVERDUE') scStatus = 'overdue';
        else if (['DELETED','REFUNDED','CHARGEBACK_REQUESTED'].includes(asaasUpper)) scStatus = 'cancelled';

        if (scStatus !== sc.status) {
          result.totalDivergent++;
          const divergence = {
            paymentId: sc.id,
            asaasPaymentId: sc.asaas_payment_id,
            localStatus: sc.status,
            asaasStatus: scStatus,
            fixed: false,
          };

          try {
            const paidDate = asaasCharge.paymentDate 
              ? new Date(asaasCharge.paymentDate).toISOString().slice(0,19).replace('T',' ')
              : null;

            if (paidDate && scStatus === 'paid') {
              await db.execute(sql`
                UPDATE subscription_charges
                SET status = ${scStatus}, paid_date = ${paidDate},
                    net_value = ${asaasCharge.netValue ?? null}
                WHERE id = ${sc.id}
              `);
            } else {
              await db.execute(sql`
                UPDATE subscription_charges
                SET status = ${scStatus}
                WHERE id = ${sc.id}
              `);
            }
            divergence.fixed = true;
            result.totalFixed++;
            console.log(`[Reconciliation] SC #${sc.id} corrigido: ${sc.status} → ${scStatus}`);
          } catch (err) {
            console.error(`[Reconciliation] Erro ao corrigir SC #${sc.id}:`, err);
          }
          result.divergences.push(divergence);
        }
        result.totalChecked++;
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err) {
        console.error(`[Reconciliation] Erro ao verificar SC #${sc.id}:`, err);
      }
    }

    // ═══════════════════════════════════════════════════════
    // Reconcilia asaas_payments (combustível, vistorias etc.)
    // ═══════════════════════════════════════════════════════
    const pendingPayments = await db.execute(sql.raw(`
      SELECT id, asaas_payment_id, status, charge_type, charge_id
      FROM asaas_payments 
      WHERE status IN ('pending', 'confirmed')
      AND asaas_payment_id IS NOT NULL
      ORDER BY created_at ASC
      LIMIT ${RECONCILIATION_BATCH_SIZE}
    `)) as any;

    const payments = Array.isArray(pendingPayments[0]) ? pendingPayments[0] : [];
    result.totalChecked += payments.length;

    console.log(`[Reconciliation] Verificando ${payments.length} asaas_payments pendentes...`);

    for (const payment of payments) {
      try {
        // Busca status no Asaas
        const asaasCharge = await getChargeStatus(payment.asaas_payment_id);
        
        if (!asaasCharge) {
          console.warn(`[Reconciliation] Cobrança não encontrada no Asaas: ${payment.asaas_payment_id}`);
          continue;
        }

        const asaasStatus = mapAsaasStatus(asaasCharge.status);
        const localStatus = payment.status;

        // Verifica se há divergência
        if (asaasStatus !== localStatus) {
          result.totalDivergent++;
          
          const divergence = {
            paymentId: payment.id,
            asaasPaymentId: payment.asaas_payment_id,
            localStatus,
            asaasStatus,
            fixed: false,
          };

          // Corrige a divergência
          try {
            await updatePaymentStatus({
              asaasPaymentId: payment.asaas_payment_id,
              status: asaasCharge.status,
              paymentDate: asaasCharge.paymentDate ? new Date(asaasCharge.paymentDate) : undefined,
              netValue: asaasCharge.netValue,
              source: 'reconciliation',
            });

            // Atualiza tabela de origem
            const legacyStatus = mapToLegacyStatus(asaasStatus);
            await updateSourceTableStatus(db, payment.charge_type, payment.charge_id, legacyStatus);

            divergence.fixed = true;
            result.totalFixed++;

            console.log(`[Reconciliation] Divergência corrigida: ${payment.asaas_payment_id} (${localStatus} -> ${asaasStatus})`);
          } catch (error) {
            console.error(`[Reconciliation] Erro ao corrigir divergência: ${payment.asaas_payment_id}`, error);
          }

          result.divergences.push(divergence);
        }

        // Pequeno delay para não sobrecarregar a API
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`[Reconciliation] Erro ao verificar pagamento ${payment.id}:`, error);
      }
    }

    // Atualiza registro de reconciliação
    await db.execute(sql`
      UPDATE payment_reconciliations 
      SET 
        status = 'completed',
        total_checked = ${result.totalChecked},
        total_divergent = ${result.totalDivergent},
        total_fixed = ${result.totalFixed},
        details = ${JSON.stringify(result.divergences)}
      WHERE id = ${reconciliationId}
    `);

    console.log(`[Reconciliation] Concluída: ${result.totalChecked} verificados, ${result.totalDivergent} divergências, ${result.totalFixed} corrigidos`);

  } catch (error) {
    // Marca como falha
    await db.execute(sql`
      UPDATE payment_reconciliations 
      SET 
        status = 'failed',
        details = ${JSON.stringify({ error: String(error) })}
      WHERE id = ${reconciliationId}
    `);
    
    throw error;
  }

  return result;
}

/**
 * Verifica e expira cobranças PIX antigas
 */
export async function expireOldPixCharges(): Promise<{
  expired: number;
  errors: number;
}> {
  const db = await getDb();
  if (!db) {
    throw new Error('Database not available');
  }

  console.log('[Expiration] Verificando cobranças PIX expiradas...');

  const result = { expired: 0, errors: 0 };

  try {
    // Busca cobranças PIX pendentes criadas há mais de X minutos
    const cutoffTime = new Date(Date.now() - PIX_EXPIRATION_MINUTES * 60 * 1000);
    
    const expiredPayments = await db.execute(sql`
      SELECT id, asaas_payment_id, charge_type, charge_id, client_email
      FROM asaas_payments 
      WHERE status = 'pending'
      AND billing_type = 'PIX'
      AND created_at < ${cutoffTime}
      AND (pix_expiration_date IS NULL OR pix_expiration_date < NOW())
    `) as any;

    const payments = Array.isArray(expiredPayments[0]) ? expiredPayments[0] : [];

    console.log(`[Expiration] Encontradas ${payments.length} cobranças PIX expiradas`);

    for (const payment of payments) {
      try {
        // Atualiza status para expirado/cancelado
        await db.execute(sql`
          UPDATE asaas_payments 
          SET status = 'cancelled', updated_at = NOW()
          WHERE id = ${payment.id}
        `);

        // Registra log de auditoria
        await logPaymentAudit({
          paymentId: payment.id,
          asaasPaymentId: payment.asaas_payment_id,
          action: 'expired',
          oldStatus: 'pending',
          newStatus: 'cancelled',
          details: { reason: 'PIX expirado', expirationMinutes: PIX_EXPIRATION_MINUTES },
          source: 'api',
        });

        // Atualiza tabela de origem se necessário
        // (opcional: pode liberar reserva, notificar cliente, etc.)

        result.expired++;
        console.log(`[Expiration] Cobrança expirada: ${payment.asaas_payment_id}`);
      } catch (error) {
        console.error(`[Expiration] Erro ao expirar cobrança ${payment.id}:`, error);
        result.errors++;
      }
    }

  } catch (error) {
    console.error('[Expiration] Erro geral:', error);
    throw error;
  }

  console.log(`[Expiration] Concluído: ${result.expired} expiradas, ${result.errors} erros`);
  return result;
}

/**
 * Verifica cobranças vencidas e atualiza status
 */
export async function checkOverdueCharges(): Promise<{
  updated: number;
  errors: number;
}> {
  const db = await getDb();
  if (!db) {
    throw new Error('Database not available');
  }

  console.log('[Overdue] Verificando cobranças vencidas...');

  const result = { updated: 0, errors: 0 };

  try {
    // Busca cobranças pendentes com data de vencimento passada
    const overduePayments = await db.execute(sql`
      SELECT id, asaas_payment_id, charge_type, charge_id
      FROM asaas_payments 
      WHERE status = 'pending'
      AND due_date < NOW()
    `) as any;

    const payments = Array.isArray(overduePayments[0]) ? overduePayments[0] : [];

    console.log(`[Overdue] Encontradas ${payments.length} cobranças vencidas`);

    for (const payment of payments) {
      try {
        // Verifica status real no Asaas antes de marcar como vencido
        const asaasCharge = await getChargeStatus(payment.asaas_payment_id);
        
        if (asaasCharge) {
          const asaasStatus = mapAsaasStatus(asaasCharge.status);
          
          // Se foi pago no Asaas, atualiza para pago
          if (['confirmed', 'received'].includes(asaasStatus)) {
            await updatePaymentStatus({
              asaasPaymentId: payment.asaas_payment_id,
              status: asaasCharge.status,
              paymentDate: asaasCharge.paymentDate ? new Date(asaasCharge.paymentDate) : undefined,
              netValue: asaasCharge.netValue,
              source: 'reconciliation',
            });
            
            const legacyStatus = mapToLegacyStatus(asaasStatus);
            await updateSourceTableStatus(db, payment.charge_type, payment.charge_id, legacyStatus);
            
            result.updated++;
            continue;
          }
        }

        // Marca como vencido
        await db.execute(sql`
          UPDATE asaas_payments 
          SET status = 'overdue', updated_at = NOW()
          WHERE id = ${payment.id}
        `);

        // Atualiza tabela de origem
        await updateSourceTableStatus(db, payment.charge_type, payment.charge_id, 'overdue');

        // Registra log de auditoria
        await logPaymentAudit({
          paymentId: payment.id,
          asaasPaymentId: payment.asaas_payment_id,
          action: 'status_changed',
          oldStatus: 'pending',
          newStatus: 'overdue',
          details: { reason: 'Vencimento ultrapassado' },
          source: 'api',
        });

        result.updated++;
      } catch (error) {
        console.error(`[Overdue] Erro ao processar cobrança ${payment.id}:`, error);
        result.errors++;
      }
    }

  } catch (error) {
    console.error('[Overdue] Erro geral:', error);
    throw error;
  }

  // Atualiza diretamente inspection_charges que não têm asaas_payment vinculado
  // (cobranças manuais sem integração Asaas)
  try {
    const directResult = await db.execute(sql`
      UPDATE inspection_charges
      SET payment_status = 'overdue', updated_at = NOW()
      WHERE payment_status = 'pending'
        AND due_date < CURDATE()
        AND id NOT IN (
          SELECT DISTINCT charge_id FROM asaas_payments
          WHERE charge_type IN ('inspection', 'repair')
            AND charge_id IS NOT NULL
        )
    `) as any;
    const directUpdated = directResult?.[0]?.affectedRows ?? 0;
    if (directUpdated > 0) {
      console.log(`[Overdue] ${directUpdated} cobranças de danos manuais marcadas como vencidas`);
      result.updated += directUpdated;
    }
  } catch (error) {
    console.error('[Overdue] Erro ao atualizar inspection_charges manuais:', error);
    result.errors++;
  }

  console.log(`[Overdue] Concluído: ${result.updated} atualizadas, ${result.errors} erros`);
  return result;
}

/**
 * Atualiza status na tabela de origem
 */
async function updateSourceTableStatus(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  chargeType: string,
  chargeId: number,
  status: 'pending' | 'paid' | 'overdue'
): Promise<void> {
  switch (chargeType) {
    case 'fuel':
      await db.execute(sql`
        UPDATE fuel_records 
        SET payment_status = ${status}
        WHERE id = ${chargeId}
      `);
      break;
      
    case 'inspection':
    case 'repair':
      await db.execute(sql`
        UPDATE inspection_charges 
        SET payment_status = ${status}, updated_at = NOW()
        WHERE id = ${chargeId}
      `);
      break;
  }
}

/**
 * Busca histórico de reconciliações
 */
export async function getReconciliationHistory(limit = 10): Promise<Array<{
  id: number;
  runDate: Date;
  totalChecked: number;
  totalDivergent: number;
  totalFixed: number;
  status: string;
  runBy: string | null;
}>> {
  const db = await getDb();
  if (!db) {
    return [];
  }

  const result = await db.execute(sql`
    SELECT id, run_date, total_checked, total_divergent, total_fixed, status, run_by
    FROM payment_reconciliations
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as any;

  const records = Array.isArray(result[0]) ? result[0] : [];

  return records.map((r: any) => ({
    id: r.id,
    runDate: r.run_date,
    totalChecked: r.total_checked,
    totalDivergent: r.total_divergent,
    totalFixed: r.total_fixed,
    status: r.status,
    runBy: r.run_by,
  }));
}

/**
 * Migra fuel_records antigos para asaas_payments
 * Executa apenas uma vez para registros que ainda não foram migrados
 */
export async function migrateFuelRecordsToAsaasPayments(): Promise<{
  migrated: number;
  errors: number;
}> {
  const db = await getDb();
  if (!db) {
    throw new Error('Database not available');
  }

  console.log('[Migration] Iniciando migração de fuel_records para asaas_payments...');

  const result = { migrated: 0, errors: 0 };

  try {
    // Busca todos os fuel_records com asaas_charge_id que não estão em asaas_payments
    const fuelRecords = await db.execute(sql`
      SELECT fr.*
      FROM fuel_records fr
      LEFT JOIN asaas_payments ap ON ap.asaas_payment_id = fr.asaas_charge_id
      WHERE fr.asaas_charge_id IS NOT NULL
      AND ap.id IS NULL
      ORDER BY fr.created_at ASC
    `) as any;

    const records = Array.isArray(fuelRecords[0]) ? fuelRecords[0] : [];

    console.log(`[Migration] Encontrados ${records.length} fuel_records para migrar`);

    for (const record of records) {
      try {
        const { savePaymentRecord } = await import('./asaasService');
        
        // Registra em asaas_payments
        await savePaymentRecord({
          asaasPaymentId: record.asaas_charge_id,
          asaasCustomerId: '', // Não temos customer_id em fuel_records antigos
          chargeType: 'fuel',
          chargeId: record.id,
          value: record.total_amount / 100, // Converter centavos para reais
          billingType: 'UNDEFINED',
          dueDate: record.due_date || new Date(),
          clientEmail: record.client_email || '',
          description: `Abastecimento - ${record.vessel_name || 'Embarcação'}`,
        });

        result.migrated++;
        console.log(`[Migration] Migrado fuel_record #${record.id} -> asaas_payments`);
      } catch (error) {
        console.error(`[Migration] Erro ao migrar fuel_record #${record.id}:`, error);
        result.errors++;
      }
    }

  } catch (error) {
    console.error('[Migration] Erro geral:', error);
    throw error;
  }

  console.log(`[Migration] Concluído: ${result.migrated} migrados, ${result.errors} erros`);
  return result;
}

/**
 * Sincroniza status de pagamentos pendentes consultando API do Asaas
 * Atualiza fuel_records e asaas_payments com status real
 */
export async function syncPaymentStatuses(): Promise<{
  checked: number;
  updated: number;
  errors: number;
}> {
  const db = await getDb();
  if (!db) {
    throw new Error('Database not available');
  }

  console.log('[Sync] Iniciando sincronização de status de pagamentos...');

  const result = { checked: 0, updated: 0, errors: 0 };

  try {
    // Busca todos os fuel_records com asaas_charge_id e status pendente
    const pendingRecords = await db.execute(sql`
      SELECT id, asaas_charge_id, payment_status
      FROM fuel_records
      WHERE asaas_charge_id IS NOT NULL
      AND payment_status = 'pending'
      ORDER BY created_at DESC
    `) as any;

    const records = Array.isArray(pendingRecords[0]) ? pendingRecords[0] : [];

    console.log(`[Sync] Encontrados ${records.length} abastecimentos pendentes para verificar`);

    for (const record of records) {
      result.checked++;
      
      try {
        const { fetchPaymentFromAsaas } = await import('./asaasService');
        
        // Consulta status real no Asaas
        const payment = await fetchPaymentFromAsaas(record.asaas_charge_id);
        
        if (!payment) {
          console.warn(`[Sync] Pagamento ${record.asaas_charge_id} não encontrado no Asaas`);
          continue;
        }

        // Mapeia status do Asaas para status local
        let newStatus: 'pending' | 'paid' | 'overdue' = 'pending';
        
        if (payment.status === 'RECEIVED' || payment.status === 'CONFIRMED') {
          newStatus = 'paid';
        } else if (payment.status === 'OVERDUE') {
          newStatus = 'overdue';
        }

        // Se status mudou, atualiza
        if (newStatus !== record.payment_status) {
          // Atualiza fuel_records
          await db.execute(sql`
            UPDATE fuel_records
            SET payment_status = ${newStatus}
            WHERE id = ${record.id}
          `);

          // Atualiza asaas_payments (se existir)
          await db.execute(sql`
            UPDATE asaas_payments
            SET payment_status = ${newStatus}, updated_at = NOW()
            WHERE asaas_payment_id = ${record.asaas_charge_id}
          `);

          result.updated++;
          console.log(`[Sync] Atualizado fuel_record #${record.id}: ${record.payment_status} → ${newStatus}`);
        }

      } catch (error) {
        console.error(`[Sync] Erro ao verificar fuel_record #${record.id}:`, error);
        result.errors++;
      }
    }

  } catch (error) {
    console.error('[Sync] Erro geral:', error);
    throw error;
  }

  console.log(`[Sync] Concluído: ${result.checked} verificados, ${result.updated} atualizados, ${result.errors} erros`);
  return result;
}

/**
 * Executa todas as verificações de manutenção
 * Pode ser chamado periodicamente (ex: a cada 5 minutos)
 */
export async function runMaintenanceTasks(): Promise<{
  reconciliation: ReconciliationResult | null;
  expiration: { expired: number; errors: number } | null;
  overdue: { updated: number; errors: number } | null;
  migration: { migrated: number; errors: number } | null;
  sync: { checked: number; updated: number; errors: number } | null;
}> {
  const result = {
    reconciliation: null as ReconciliationResult | null,
    expiration: null as { expired: number; errors: number } | null,
    overdue: null as { updated: number; errors: number } | null,
    migration: null as { migrated: number; errors: number } | null,
    sync: null as { checked: number; updated: number; errors: number } | null,
  };

  try {
    // 0. Migra fuel_records antigos para asaas_payments (executa apenas uma vez)
    result.migration = await migrateFuelRecordsToAsaasPayments();
  } catch (error) {
    console.error('[Maintenance] Erro na migração:', error);
  }

  try {
    // 0.5. Sincroniza status de pagamentos pendentes com Asaas
    result.sync = await syncPaymentStatuses();
  } catch (error) {
    console.error('[Maintenance] Erro na sincronização:', error);
  }

  try {
    // 1. Expira PIX antigos
    result.expiration = await expireOldPixCharges();
  } catch (error) {
    console.error('[Maintenance] Erro na expiração:', error);
  }

  try {
    // 2. Verifica cobranças vencidas
    result.overdue = await checkOverdueCharges();
  } catch (error) {
    console.error('[Maintenance] Erro na verificação de vencidos:', error);
  }

  try {
    // 3. Reconciliação (menos frequente, pode ser pesado)
    result.reconciliation = await runReconciliation('system');
  } catch (error) {
    console.error('[Maintenance] Erro na reconciliação:', error);
  }

  return result;
}
