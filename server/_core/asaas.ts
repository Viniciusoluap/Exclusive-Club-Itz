/**
 * Serviço de integração com API do Asaas
 * Documentação: https://docs.asaas.com/reference
 * 
 * WORKAROUND: Busca chave API do banco de dados devido a bug do Manus
 * que não injeta ASAAS_API_KEY corretamente no ambiente.
 */
import { getSetting } from "../systemSettings";

/**
 * Busca chave API do Asaas (banco de dados ou env)
 */
async function getAsaasApiKey(): Promise<string> {
  // Primeiro tenta buscar do banco (workaround)
  const keyFromDb = await getSetting("asaas_api_key");
  if (keyFromDb) {
    return keyFromDb;
  }

  // Fallback para env (caso Manus corrija o bug)
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
  const createResponse = await fetch(`${apiUrl}/customers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'access_token': apiKey,
    },
    body: JSON.stringify(params),
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
