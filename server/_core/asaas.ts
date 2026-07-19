/**
 * Serviço de integração com API do Asaas
 * Documentação: https://docs.asaas.com/reference
 * 
 * WORKAROUND: Busca chave API do banco de dados devido a bug do Manus
 * que não injeta ASAAS_API_KEY corretamente no ambiente.
 */
import { getSetting } from "../systemSettings";
import { ENV } from "./env";

/**
 * Resolução ÚNICA e canônica da chave da API do Asaas.
 *
 * Prioridade:
 *   1. process.env.ASAAS_API_KEY (via ENV.asaasApiKey) — override avançado opcional,
 *      permite mover a credencial para fora do banco sem quebrar nada.
 *   2. getSetting('asaas_api_key') do banco — fonte "oficial", editável pelo painel
 *      admin (client/src/pages/SystemSettings.tsx). Comportamento histórico preservado.
 *
 * Se a env var não estiver configurada (caso atual), o comportamento é 100% idêntico
 * ao anterior: lê do banco. Retorna null quando nenhuma fonte tem a chave.
 *
 * NUNCA loga o valor da chave.
 */
export async function resolveAsaasApiKey(): Promise<string | null> {
  const fromEnv = ENV.asaasApiKey;
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }

  const fromDb = await getSetting("asaas_api_key");
  if (fromDb && fromDb.length > 0) {
    return fromDb;
  }

  return null;
}

/**
 * Variante que lança erro quando a chave não está configurada.
 * Usada internamente pelas chamadas à API do Asaas que exigem a credencial.
 */
async function getAsaasApiKey(): Promise<string> {
  const apiKey = await resolveAsaasApiKey();
  if (!apiKey) {
    throw new Error("ASAAS_API_KEY não configurada. Configure em /admin/configuracoes");
  }
  return apiKey;
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
 * Cria uma cobrança no Asaas
 */
export async function createCharge(params: {
  customer: string; // ID do cliente no Asaas
  billingType: 'BOLETO' | 'CREDIT_CARD' | 'PIX' | 'UNDEFINED';
  value: number; // Valor em reais
  dueDate: string; // Data de vencimento (YYYY-MM-DD)
  description: string;
  externalReference?: string; // Referência externa (ID do abastecimento)
}) {
  const apiKey = await getAsaasApiKey();
  const apiUrl = await getAsaasApiUrl();

  const response = await fetch(`${apiUrl}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'access_token': apiKey,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erro ao criar cobrança no Asaas: ${error}`);
  }

  return await response.json();
}

/**
 * Cancela uma cobrança no Asaas
 */
export async function deleteCharge(chargeId: string) {
  const apiKey = await getAsaasApiKey();
  const apiUrl = await getAsaasApiUrl();

  const response = await fetch(`${apiUrl}/payments/${chargeId}`, {
    method: 'DELETE',
    headers: {
      'access_token': apiKey,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erro ao cancelar cobrança no Asaas: ${error}`);
  }

  return await response.json();
}

/**
 * Busca uma cobrança no Asaas
 */
export async function getCharge(chargeId: string) {
  const apiKey = await getAsaasApiKey();
  const apiUrl = await getAsaasApiUrl();

  const response = await fetch(`${apiUrl}/payments/${chargeId}`, {
    method: 'GET',
    headers: {
      'access_token': apiKey,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Erro ao buscar cobrança no Asaas: ${error}`);
  }

  return await response.json();
}

/**
 * Busca ou cria um cliente no Asaas
 */
export async function getOrCreateCustomer(params: {
  name: string;
  email: string;
  cpfCnpj?: string;
  phone?: string;
}) {
  const apiKey = await getAsaasApiKey();
  const apiUrl = await getAsaasApiUrl();

  // Primeiro tenta buscar cliente existente por email
  const searchResponse = await fetch(
    `${apiUrl}/customers?email=${encodeURIComponent(params.email)}`,
    {
      method: 'GET',
      headers: {
        'access_token': apiKey,
      },
    }
  );

  if (searchResponse.ok) {
    const searchData = await searchResponse.json();
    if (searchData.data && searchData.data.length > 0) {
      return searchData.data[0]; // Retorna cliente existente
    }
  }

  // Se não encontrou, cria novo cliente
  // Filtrar campos vazios/null/undefined para não enviar ao Asaas
  const customerData: Record<string, string> = {
    name: params.name,
    email: params.email,
  };
  
  if (params.cpfCnpj) {
    customerData.cpfCnpj = params.cpfCnpj;
  }
  if (params.phone) {
    customerData.phone = params.phone;
  }
  
  const createResponse = await fetch(`${apiUrl}/customers`, {
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

  return await createResponse.json();
}

/**
 * Mapeia status do Asaas para status do sistema
 */
export function mapAsaasStatus(asaasStatus: string): 'pending' | 'paid' | 'overdue' {
  switch (asaasStatus) {
    case 'PENDING':
    case 'AWAITING_PAYMENT':
      return 'pending';
    case 'RECEIVED':
    case 'CONFIRMED':
      return 'paid';
    case 'OVERDUE':
      return 'overdue';
    case 'REFUNDED':
    case 'RECEIVED_IN_CASH':
    case 'REFUND_REQUESTED':
    case 'CHARGEBACK_REQUESTED':
    case 'CHARGEBACK_DISPUTE':
    case 'AWAITING_CHARGEBACK_REVERSAL':
      return 'pending'; // Cobranças canceladas/reembolsadas voltam para pending
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
 * Busca QR Code PIX de uma cobrança
 */
export async function getPixQrCode(chargeId: string): Promise<{ encodedImage: string | null; payload: string | null }> {
  const apiKey = await getAsaasApiKey();
  const apiUrl = await getAsaasApiUrl();

  try {
    // Primeiro tenta buscar no endpoint específico
    const response = await fetch(`${apiUrl}/payments/${chargeId}/pixQrCode`, {
      method: 'GET',
      headers: {
        'access_token': apiKey,
      },
    });

    if (response.ok) {
      const data = await response.json();
      return {
        encodedImage: data.encodedImage || null,
        payload: data.payload || null,
      };
    }

    // Se falhou, tenta buscar da cobrança principal
    const charge = await getCharge(chargeId);
    return {
      encodedImage: charge.encodedImage || null,
      payload: charge.payload || null,
    };
  } catch (error) {
    console.error('[Asaas] Erro ao buscar QR Code:', error);
    return {
      encodedImage: null,
      payload: null,
    };
  }
}
