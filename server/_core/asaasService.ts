/**
 * Serviço de integração completa com API do Asaas
 * Documentação: https://docs.asaas.com/reference
 * 
 * Features:
 * - Retry com backoff exponencial para falhas temporárias
 * - Tratamento de erros específicos do Asaas
 * - Validação de CPF/CNPJ
 * - Cache de clientes Asaas
 * - Logs de auditoria
 */
import { getSetting } from "../systemSettings";
import { getDb } from "../db";
import { sql } from "drizzle-orm";

// Tipos
export interface AsaasCustomerData {
  id: string;
  name: string;
  email: string;
  cpfCnpj?: string;
  phone?: string;
}

export interface AsaasChargeData {
  id: string;
  customer: string;
  value: number;
  netValue?: number;
  status: string;
  billingType: string;
  dueDate: string;
  paymentDate?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  externalReference?: string;
  description?: string;
}

export interface AsaasPixData {
  encodedImage: string | null;
  payload: string | null;
  expirationDate?: string;
}

export interface CreateChargeParams {
  customerId: string;
  value: number;
  description: string;
  dueDate: string;
  externalReference?: string;
  billingType?: 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'UNDEFINED';
}

// Configuração de retry
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

/**
 * Busca chave API do Asaas (banco de dados ou env)
 */
async function getAsaasApiKey(): Promise<string> {
  const keyFromDb = await getSetting("asaas_api_key");
  if (keyFromDb) {
    return keyFromDb;
  }

  const keyFromEnv = process.env.ASAAS_API_KEY;
  if (keyFromEnv) {
    return keyFromEnv;
  }

  throw new Error("ASAAS_API_KEY não configurada. Configure em /admin/configuracoes");
}

/**
 * Determina URL da API baseado na chave
 */
async function getAsaasApiUrl(): Promise<string> {
  const apiKey = await getAsaasApiKey();
  return apiKey.startsWith("$aact_prod_")
    ? "https://api.asaas.com/v3"
    : "https://sandbox.asaas.com/api/v3";
}

/**
 * Valida CPF (11 dígitos)
 */
export function isValidCPF(cpf: string): boolean {
  const cleaned = cpf.replace(/\D/g, '');
  if (cleaned.length !== 11) return false;
  
  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1+$/.test(cleaned)) return false;
  
  // Validação do primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleaned[i]) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleaned[9])) return false;
  
  // Validação do segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleaned[i]) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cleaned[10])) return false;
  
  return true;
}

/**
 * Valida CNPJ (14 dígitos)
 */
export function isValidCNPJ(cnpj: string): boolean {
  const cleaned = cnpj.replace(/\D/g, '');
  if (cleaned.length !== 14) return false;
  
  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1+$/.test(cleaned)) return false;
  
  // Validação do primeiro dígito verificador
  let size = cleaned.length - 2;
  let numbers = cleaned.substring(0, size);
  const digits = cleaned.substring(size);
  let sum = 0;
  let pos = size - 7;
  
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;
  
  // Validação do segundo dígito verificador
  size = size + 1;
  numbers = cleaned.substring(0, size);
  sum = 0;
  pos = size - 7;
  
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(1))) return false;
  
  return true;
}

/**
 * Valida CPF ou CNPJ
 */
export function isValidCpfCnpj(value: string): boolean {
  const cleaned = value.replace(/\D/g, '');
  if (cleaned.length === 11) return isValidCPF(cleaned);
  if (cleaned.length === 14) return isValidCNPJ(cleaned);
  return false;
}

/**
 * Sleep helper para retry
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Executa request com retry e backoff exponencial
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // Se for erro de rate limit (429), espera e tenta novamente
      if (response.status === 429) {
        const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
        console.log(`[Asaas] Rate limit hit, waiting ${delay}ms before retry...`);
        await sleep(delay);
        continue;
      }
      
      // Se for erro de servidor (5xx), tenta novamente
      if (response.status >= 500) {
        const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
        console.log(`[Asaas] Server error ${response.status}, waiting ${delay}ms before retry...`);
        await sleep(delay);
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error as Error;
      const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
      console.log(`[Asaas] Network error, waiting ${delay}ms before retry...`, error);
      await sleep(delay);
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

/**
 * Registra log de auditoria de pagamento
 */
export async function logPaymentAudit(params: {
  paymentId: number;
  asaasPaymentId?: string;
  action: string;
  oldStatus?: string;
  newStatus?: string;
  details?: Record<string, unknown>;
  source: 'webhook' | 'api' | 'manual' | 'reconciliation';
  performedBy?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  try {
    const detailsJson = params.details ? JSON.stringify(params.details) : null;
    await db.execute(sql`
      INSERT INTO payment_audit_logs 
      (payment_id, asaas_payment_id, action, old_status, new_status, details, source, performed_by)
      VALUES (
        ${params.paymentId},
        ${params.asaasPaymentId || null},
        ${params.action},
        ${params.oldStatus || null},
        ${params.newStatus || null},
        ${detailsJson},
        ${params.source},
        ${params.performedBy || null}
      )
    `);
  } catch (error) {
    console.error('[Asaas] Erro ao registrar log de auditoria:', error);
  }
}

/**
 * Registra log de webhook
 */
export async function logWebhook(params: {
  source: string;
  eventType: string;
  payload: Record<string, unknown>;
  headers?: Record<string, string>;
  ipAddress?: string;
}): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  
  try {
    // Alinhado ao schema canônico de webhook_logs (DB-21): colunas reais são
    // event, asaas_payment_id, payload, processed, error, created_at.
    // As colunas antigas (source, event_type, headers, ip_address) não existem
    // na tabela recriada — este INSERT falharia em silêncio se as usasse.
    // Preservamos a origem prefixando o evento com a source.
    const eventName = params.source ? `${params.source}:${params.eventType}` : params.eventType;
    const result = await db.execute(sql`
      INSERT INTO webhook_logs (event, payload, processed)
      VALUES (${eventName}, ${JSON.stringify(params.payload)}, 0)
    `) as any;

    return result[0]?.insertId || null;
  } catch (error) {
    console.error('[Asaas] Erro ao registrar log de webhook:', error);
    return null;
  }
}

/**
 * Atualiza log de webhook como processado
 */
export async function updateWebhookLog(params: {
  id: number;
  processed: boolean;
  errorMessage?: string;
  relatedPaymentId?: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  
  try {
    // Alinhado ao schema canônico de webhook_logs (DB-21): as colunas
    // processed_at / error_message / related_payment_id não existem na tabela
    // recriada. Mapeamos para as colunas reais processed (tinyint) e error.
    await db.execute(sql`
      UPDATE webhook_logs
      SET
        processed = ${params.processed ? 1 : 0},
        error = ${params.errorMessage || null}
      WHERE id = ${params.id}
    `);
  } catch (error) {
    console.error('[Asaas] Erro ao atualizar log de webhook:', error);
  }
}

/**
 * Busca ou cria cliente no Asaas (com cache no banco)
 */
export async function getOrCreateAsaasCustomer(params: {
  email: string;
  name: string;
  cpfCnpj?: string;
  phone?: string;
}): Promise<AsaasCustomerData> {
  const db = await getDb();
  const apiKey = await getAsaasApiKey();
  const apiUrl = await getAsaasApiUrl();
  
  // Primeiro verifica cache local
  if (db) {
    const cached = await db.execute(sql`
      SELECT asaas_customer_id, name, cpf_cnpj 
      FROM asaas_customers 
      WHERE client_email = ${params.email}
    `) as any;
    
    const cachedCustomer = Array.isArray(cached[0]) ? cached[0][0] : cached[0];
    if (cachedCustomer?.asaas_customer_id) {
      console.log('[Asaas] Cliente encontrado no cache:', cachedCustomer.asaas_customer_id);
      return {
        id: cachedCustomer.asaas_customer_id,
        name: cachedCustomer.name || params.name,
        email: params.email,
        cpfCnpj: cachedCustomer.cpf_cnpj || params.cpfCnpj,
      };
    }
  }
  
  // Busca no Asaas por email
  const searchResponse = await fetchWithRetry(
    `${apiUrl}/customers?email=${encodeURIComponent(params.email)}`,
    {
      method: 'GET',
      headers: { 'access_token': apiKey },
    }
  );
  
  if (searchResponse.ok) {
    const searchData = await searchResponse.json();
    if (searchData.data && searchData.data.length > 0) {
      const existingCustomer = searchData.data[0];
      
      // Salva no cache
      if (db) {
        await db.execute(sql`
          INSERT INTO asaas_customers (client_email, asaas_customer_id, cpf_cnpj, name)
          VALUES (${params.email}, ${existingCustomer.id}, ${existingCustomer.cpfCnpj || null}, ${existingCustomer.name})
          ON DUPLICATE KEY UPDATE 
            asaas_customer_id = ${existingCustomer.id},
            name = ${existingCustomer.name},
            updated_at = NOW()
        `);
      }
      
      console.log('[Asaas] Cliente existente encontrado:', existingCustomer.id);
      return existingCustomer;
    }
  }
  
  // Cria novo cliente
  const customerData: Record<string, string> = {
    name: params.name,
    email: params.email,
  };
  
  if (params.cpfCnpj) {
    const cleanedCpfCnpj = params.cpfCnpj.replace(/\D/g, '');
    if (isValidCpfCnpj(cleanedCpfCnpj)) {
      customerData.cpfCnpj = cleanedCpfCnpj;
    } else {
      console.warn('[Asaas] CPF/CNPJ inválido, criando cliente sem documento:', params.cpfCnpj);
    }
  }
  
  if (params.phone) {
    customerData.phone = params.phone.replace(/\D/g, '');
  }
  
  const createResponse = await fetchWithRetry(`${apiUrl}/customers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'access_token': apiKey,
    },
    body: JSON.stringify(customerData),
  });
  
  if (!createResponse.ok) {
    const error = await createResponse.text();
    throw new Error(`Erro ao criar cliente no Asaas: ${error}`);
  }
  
  const newCustomer = await createResponse.json();
  
  // Salva no cache
  if (db) {
    await db.execute(sql`
      INSERT INTO asaas_customers (client_email, asaas_customer_id, cpf_cnpj, name)
      VALUES (${params.email}, ${newCustomer.id}, ${newCustomer.cpfCnpj || null}, ${newCustomer.name})
      ON DUPLICATE KEY UPDATE 
        asaas_customer_id = ${newCustomer.id},
        name = ${newCustomer.name},
        updated_at = NOW()
    `);
  }
  
  console.log('[Asaas] Novo cliente criado:', newCustomer.id);
  return newCustomer;
}

/**
 * Cria cobrança PIX no Asaas
 */
export async function createPixCharge(params: CreateChargeParams): Promise<AsaasChargeData> {
  const apiKey = await getAsaasApiKey();
  const apiUrl = await getAsaasApiUrl();
  
  const chargeData = {
    customer: params.customerId,
    billingType: params.billingType || 'PIX',
    value: params.value,
    dueDate: params.dueDate,
    description: params.description,
    externalReference: params.externalReference,
  };
  
  console.log('[Asaas] Criando cobrança PIX:', chargeData);
  
  const response = await fetchWithRetry(`${apiUrl}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'access_token': apiKey,
    },
    body: JSON.stringify(chargeData),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erro ao criar cobrança no Asaas: ${error}`);
  }
  
  const charge = await response.json();
  console.log('[Asaas] Cobrança criada:', charge.id);
  
  return charge;
}

/**
 * Busca QR Code PIX de uma cobrança
 */
export async function getPixQrCode(chargeId: string): Promise<AsaasPixData> {
  const apiKey = await getAsaasApiKey();
  const apiUrl = await getAsaasApiUrl();
  
  try {
    const response = await fetchWithRetry(`${apiUrl}/payments/${chargeId}/pixQrCode`, {
      method: 'GET',
      headers: { 'access_token': apiKey },
    });
    
    if (response.ok) {
      const data = await response.json();
      return {
        encodedImage: data.encodedImage || null,
        payload: data.payload || null,
        expirationDate: data.expirationDate,
      };
    }
    
    // Fallback: busca da cobrança principal
    const chargeResponse = await fetchWithRetry(`${apiUrl}/payments/${chargeId}`, {
      method: 'GET',
      headers: { 'access_token': apiKey },
    });
    
    if (chargeResponse.ok) {
      const charge = await chargeResponse.json();
      return {
        encodedImage: charge.encodedImage || null,
        payload: charge.payload || null,
      };
    }
    
    return { encodedImage: null, payload: null };
  } catch (error) {
    console.error('[Asaas] Erro ao buscar QR Code:', error);
    return { encodedImage: null, payload: null };
  }
}

/**
 * Busca status de uma cobrança no Asaas
 */
export async function getChargeStatus(chargeId: string): Promise<AsaasChargeData | null> {
  const apiKey = await getAsaasApiKey();
  const apiUrl = await getAsaasApiUrl();
  
  try {
    const response = await fetchWithRetry(`${apiUrl}/payments/${chargeId}`, {
      method: 'GET',
      headers: { 'access_token': apiKey },
    });
    
    if (!response.ok) {
      console.error('[Asaas] Erro ao buscar cobrança:', await response.text());
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('[Asaas] Erro ao buscar status da cobrança:', error);
    return null;
  }
}

/**
 * Cancela uma cobrança no Asaas
 */
export async function cancelCharge(chargeId: string): Promise<boolean> {
  const apiKey = await getAsaasApiKey();
  const apiUrl = await getAsaasApiUrl();
  
  try {
    const response = await fetchWithRetry(`${apiUrl}/payments/${chargeId}`, {
      method: 'DELETE',
      headers: { 'access_token': apiKey },
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('[Asaas] Erro ao cancelar cobrança:', error);
      return false;
    }
    
    console.log('[Asaas] Cobrança cancelada:', chargeId);
    return true;
  } catch (error) {
    console.error('[Asaas] Erro ao cancelar cobrança:', error);
    return false;
  }
}

/**
 * Mapeia status do Asaas para status interno
 */
export function mapAsaasStatus(asaasStatus: string): 'pending' | 'confirmed' | 'received' | 'overdue' | 'refunded' | 'cancelled' | 'failed' {
  switch (asaasStatus) {
    case 'PENDING':
    case 'AWAITING_PAYMENT':
      return 'pending';
    case 'CONFIRMED':
      return 'confirmed';
    case 'RECEIVED':
    case 'RECEIVED_IN_CASH':
      return 'received';
    case 'OVERDUE':
      return 'overdue';
    case 'REFUNDED':
    case 'REFUND_REQUESTED':
      return 'refunded';
    case 'DELETED':
    case 'CANCELLED':
      return 'cancelled';
    case 'CHARGEBACK_REQUESTED':
    case 'CHARGEBACK_DISPUTE':
    case 'AWAITING_CHARGEBACK_REVERSAL':
      return 'failed';
    default:
      return 'pending';
  }
}

/**
 * Mapeia status interno para status legado (para compatibilidade)
 */
export function mapToLegacyStatus(status: string): 'pending' | 'paid' | 'overdue' {
  switch (status) {
    case 'confirmed':
    case 'received':
      return 'paid';
    case 'overdue':
      return 'overdue';
    default:
      return 'pending';
  }
}

/**
 * Formata data para o formato do Asaas (YYYY-MM-DD)
 */
export function formatDateForAsaas(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Salva pagamento no banco de dados central
 */
export async function savePaymentRecord(params: {
  chargeType: 'fuel' | 'inspection' | 'repair' | 'booking' | 'monthly';
  chargeId: number;
  asaasPaymentId: string;
  asaasCustomerId: string;
  value: number;
  billingType: string;
  dueDate: Date;
  description: string;
  externalReference?: string;
  clientEmail: string;
  pixQrCode?: string;
  pixCopyPaste?: string;
  pixExpirationDate?: Date;
}): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  
  try {
    const result = await db.execute(sql`
      INSERT INTO asaas_payments (
        charge_type, charge_id, asaas_payment_id, asaas_customer_id,
        value, billing_type, due_date, description, external_reference,
        client_email, pix_qr_code, pix_copy_paste, pix_expiration_date
      ) VALUES (
        ${params.chargeType},
        ${params.chargeId},
        ${params.asaasPaymentId},
        ${params.asaasCustomerId},
        ${params.value},
        ${params.billingType},
        ${params.dueDate},
        ${params.description},
        ${params.externalReference || null},
        ${params.clientEmail},
        ${params.pixQrCode || null},
        ${params.pixCopyPaste || null},
        ${params.pixExpirationDate || null}
      )
    `) as any;
    
    const paymentId = result[0]?.insertId;
    
    // Registra log de auditoria
    if (paymentId) {
      await logPaymentAudit({
        paymentId,
        asaasPaymentId: params.asaasPaymentId,
        action: 'created',
        newStatus: 'pending',
        details: { value: params.value, billingType: params.billingType },
        source: 'api',
      });
    }
    
    return paymentId || null;
  } catch (error) {
    console.error('[Asaas] Erro ao salvar registro de pagamento:', error);
    return null;
  }
}

/**
 * Consulta status de um pagamento diretamente na API do Asaas
 */
export async function fetchPaymentFromAsaas(paymentId: string): Promise<{
  id: string;
  status: string;
  value: number;
  netValue?: number;
  billingType: string;
  dueDate: string;
  paymentDate?: string;
  description?: string;
} | null> {
  const apiUrl = process.env.ASAAS_API_URL || 'https://api.asaas.com/v3';
  const apiKey = process.env.ASAAS_API_KEY;

  if (!apiUrl || !apiKey) {
    console.error('[Asaas] API URL ou API Key não configurados');
    return null;
  }

  try {
    const response = await fetchWithRetry(`${apiUrl}/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'access_token': apiKey,
      },
    });

    if (!response.ok) {
      console.error(`[Asaas] Erro ao consultar pagamento ${paymentId}:`, response.status);
      return null;
    }

    const payment = await response.json();
    return payment;
  } catch (error) {
    console.error(`[Asaas] Erro ao consultar pagamento ${paymentId}:`, error);
    return null;
  }
}

/**
 * Atualiza status de pagamento no banco de dados central
 */
export async function updatePaymentStatus(params: {
  asaasPaymentId: string;
  status: string;
  paymentDate?: Date;
  netValue?: number;
  source: 'webhook' | 'api' | 'manual' | 'reconciliation';
}): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  try {
    // Busca pagamento atual
    const current = await db.execute(sql`
      SELECT id, status FROM asaas_payments WHERE asaas_payment_id = ${params.asaasPaymentId}
    `) as any;
    
    const currentPayment = Array.isArray(current[0]) ? current[0][0] : current[0];
    if (!currentPayment) {
      console.warn('[Asaas] Pagamento não encontrado:', params.asaasPaymentId);
      return false;
    }
    
    const oldStatus = currentPayment.status;
    const newStatus = mapAsaasStatus(params.status);
    
    // Atualiza status
    await db.execute(sql`
      UPDATE asaas_payments 
      SET 
        status = ${newStatus},
        payment_date = ${params.paymentDate || null},
        net_value = ${params.netValue || null},
        updated_at = NOW()
      WHERE asaas_payment_id = ${params.asaasPaymentId}
    `);
    
    // Registra log de auditoria
    await logPaymentAudit({
      paymentId: currentPayment.id,
      asaasPaymentId: params.asaasPaymentId,
      action: 'status_changed',
      oldStatus,
      newStatus,
      details: { paymentDate: params.paymentDate, netValue: params.netValue },
      source: params.source,
    });
    
    console.log('[Asaas] Status atualizado:', { asaasPaymentId: params.asaasPaymentId, oldStatus, newStatus });
    return true;
  } catch (error) {
    console.error('[Asaas] Erro ao atualizar status de pagamento:', error);
    return false;
  }
}

/**
 * Confirma recebimento manual de cobrança no Asaas (dinheiro/cheque)
 * Endpoint: POST /v3/payments/{id}/receiveInCash
 */
export async function receiveInCash(params: {
  asaasPaymentId: string;
  paymentDate?: string;
  value?: number;
  notifyCustomer?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const apiKey = await getAsaasApiKey();
    const apiUrl = await getAsaasApiUrl();
    
    const body: Record<string, unknown> = {
      paymentDate: params.paymentDate || new Date().toISOString().split('T')[0],
      notifyCustomer: params.notifyCustomer ?? false,
    };
    
    if (params.value) {
      body.value = params.value;
    }
    
    const response = await fetchWithRetry(
      `${apiUrl}/payments/${params.asaasPaymentId}/receiveInCash`,
      {
        method: 'POST',
        headers: {
          'access_token': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[Asaas] Erro ao confirmar recebimento:', errorData);
      return {
        success: false,
        error: errorData.errors?.[0]?.description || 'Erro ao confirmar recebimento no Asaas',
      };
    }
    
    console.log('[Asaas] Recebimento confirmado:', params.asaasPaymentId);
    return { success: true };
  } catch (error) {
    console.error('[Asaas] Erro ao confirmar recebimento:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

/**
 * Lista todas as cobranças de um cliente no Asaas
 */
export async function listCustomerCharges(customerId: string, params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<AsaasChargeData[]> {
  const apiKey = await getAsaasApiKey();
  const apiUrl = await getAsaasApiUrl();
  
  try {
    const queryParams = new URLSearchParams({
      customer: customerId,
      limit: String(params?.limit || 100),
      offset: String(params?.offset || 0),
    });
    
    if (params?.status) {
      queryParams.append('status', params.status);
    }
    
    const response = await fetchWithRetry(
      `${apiUrl}/payments?${queryParams.toString()}`,
      {
        method: 'GET',
        headers: { 'access_token': apiKey },
      }
    );
    
    if (!response.ok) {
      console.error('[Asaas] Erro ao listar cobranças:', await response.text());
      return [];
    }
    
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('[Asaas] Erro ao listar cobranças do cliente:', error);
    return [];
  }
}

/**
 * Busca pagamento por ID do Asaas
 */
export async function getPaymentByAsaasId(asaasPaymentId: string): Promise<{
  id: number;
  chargeType: string;
  chargeId: number;
  status: string;
  clientEmail: string;
} | null> {
  const db = await getDb();
  if (!db) return null;
  
  try {
    const result = await db.execute(sql`
      SELECT id, charge_type, charge_id, status, client_email 
      FROM asaas_payments 
      WHERE asaas_payment_id = ${asaasPaymentId}
    `) as any;
    
    const payment = Array.isArray(result[0]) ? result[0][0] : result[0];
    if (!payment) return null;
    
    return {
      id: payment.id,
      chargeType: payment.charge_type,
      chargeId: payment.charge_id,
      status: payment.status,
      clientEmail: payment.client_email,
    };
  } catch (error) {
    console.error('[Asaas] Erro ao buscar pagamento:', error);
    return null;
  }
}

/**
 * Lista todos os clientes do Asaas
 */
export async function listAllAsaasCustomers(params?: {
  limit?: number;
  offset?: number;
}): Promise<AsaasCustomerData[]> {
  const apiKey = await getAsaasApiKey();
  const apiUrl = await getAsaasApiUrl();
  
  try {
    const queryParams = new URLSearchParams({
      limit: String(params?.limit || 100),
      offset: String(params?.offset || 0),
    });
    
    const response = await fetchWithRetry(
      `${apiUrl}/customers?${queryParams.toString()}`,
      {
        method: 'GET',
        headers: { 'access_token': apiKey },
      }
    );
    
    if (!response.ok) {
      console.error('[Asaas] Erro ao listar clientes:', await response.text());
      return [];
    }
    
    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('[Asaas] Erro ao listar clientes:', error);
    return [];
  }
}

/**
 * Lista TODAS as cobranças do Asaas (sem filtro de cliente)
 * Muito mais eficiente que iterar cliente por cliente.
 * Usa paginação interna para buscar todas as páginas.
 */
export async function listAllAsaasCharges(params?: {
  limit?: number;
  offset?: number;
  dueDateGte?: string; // Filtrar cobranças com vencimento >= esta data (YYYY-MM-DD)
}): Promise<{ charges: AsaasChargeData[]; hasMore: boolean; totalCount: number }> {
  const apiKey = await getAsaasApiKey();
  const apiUrl = await getAsaasApiUrl();

  try {
    const queryParams = new URLSearchParams({
      limit: String(params?.limit || 100),
      offset: String(params?.offset || 0),
    });
    if (params?.dueDateGte) {
      queryParams.set('dueDateGte', params.dueDateGte);
    }

    const response = await fetchWithRetry(
      `${apiUrl}/payments?${queryParams.toString()}`,
      {
        method: 'GET',
        headers: { 'access_token': apiKey },
      }
    );

    if (!response.ok) {
      console.error('[Asaas] Erro ao listar todas as cobranças:', await response.text());
      return { charges: [], hasMore: false, totalCount: 0 };
    }

    const data = await response.json();
    const charges: AsaasChargeData[] = data.data || [];
    const totalCount: number = data.totalCount ?? charges.length;
    const hasMore: boolean = data.hasMore ?? false;

    return { charges, hasMore, totalCount };
  } catch (error) {
    console.error('[Asaas] Erro ao listar todas as cobranças:', error);
    return { charges: [], hasMore: false, totalCount: 0 };
  }
}
