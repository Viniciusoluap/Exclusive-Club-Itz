/**
 * Serviço de Integração com Asaas
 * 
 * Funções para criar, cancelar e gerenciar cobranças automáticas
 * via API do Asaas.
 * 
 * Documentação: https://docs.asaas.com/reference/criar-nova-cobranca
 */

const ASAAS_API_KEY = process.env.ASAAS_API_KEY || '';
const ASAAS_API_URL = 'https://api.asaas.com/v3';

interface AsaasCustomer {
  id: string;
  name: string;
  email: string;
  cpfCnpj?: string;
}

interface AsaasCharge {
  id: string;
  customer: string;
  value: number;
  description: string;
  dueDate: string;
  invoiceUrl: string;
  status: 'PENDING' | 'RECEIVED' | 'CONFIRMED' | 'OVERDUE' | 'REFUNDED' | 'RECEIVED_IN_CASH' | 'REFUND_REQUESTED' | 'CHARGEBACK_REQUESTED' | 'CHARGEBACK_DISPUTE' | 'AWAITING_CHARGEBACK_REVERSAL' | 'DUNNING_REQUESTED' | 'DUNNING_RECEIVED' | 'AWAITING_RISK_ANALYSIS';
}

interface CreateChargeInput {
  customerEmail: string;
  customerName: string;
  value: number; // em reais (ex: 325.50)
  description: string;
  dueDate: string; // formato: YYYY-MM-DD
}

interface AsaasError {
  errors?: Array<{
    code: string;
    description: string;
  }>;
  message?: string;
}

/**
 * Busca ou cria um cliente no Asaas pelo email
 */
async function getOrCreateCustomer(email: string, name: string): Promise<string> {
  try {
    // 1. Buscar cliente existente
    const searchResponse = await fetch(
      `${ASAAS_API_URL}/customers?email=${encodeURIComponent(email)}`,
      {
        headers: {
          'access_token': ASAAS_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!searchResponse.ok) {
      throw new Error(`Asaas API error: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();

    // Se encontrou, retorna o ID
    if (searchData.data && searchData.data.length > 0) {
      return searchData.data[0].id;
    }

    // 2. Se não encontrou, cria novo cliente
    const createResponse = await fetch(`${ASAAS_API_URL}/customers`, {
      method: 'POST',
      headers: {
        'access_token': ASAAS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        email,
      }),
    });

    if (!createResponse.ok) {
      const errorData: AsaasError = await createResponse.json();
      throw new Error(
        `Failed to create customer: ${errorData.errors?.[0]?.description || errorData.message || 'Unknown error'}`
      );
    }

    const createData = await createResponse.json();
    return createData.id;
  } catch (error) {
    console.error('[Asaas] getOrCreateCustomer error:', error);
    throw error;
  }
}

/**
 * Cria uma nova cobrança no Asaas
 */
export async function createCharge(input: CreateChargeInput): Promise<AsaasCharge> {
  if (!ASAAS_API_KEY) {
    throw new Error('ASAAS_API_KEY not configured');
  }

  try {
    // 1. Obter ou criar cliente
    const customerId = await getOrCreateCustomer(input.customerEmail, input.customerName);

    // 2. Criar cobrança
    const response = await fetch(`${ASAAS_API_URL}/payments`, {
      method: 'POST',
      headers: {
        'access_token': ASAAS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customer: customerId,
        billingType: 'UNDEFINED', // Cliente escolhe forma de pagamento
        value: input.value,
        dueDate: input.dueDate,
        description: input.description,
        externalReference: `fuel_${Date.now()}`, // Referência interna
        postalService: false,
      }),
    });

    if (!response.ok) {
      const errorData: AsaasError = await response.json();
      throw new Error(
        `Failed to create charge: ${errorData.errors?.[0]?.description || errorData.message || 'Unknown error'}`
      );
    }

    const charge: AsaasCharge = await response.json();

    console.log('[Asaas] Charge created:', {
      id: charge.id,
      customer: charge.customer,
      value: charge.value,
      dueDate: charge.dueDate,
    });

    return charge;
  } catch (error) {
    console.error('[Asaas] createCharge error:', error);
    throw error;
  }
}

/**
 * Cancela uma cobrança no Asaas
 */
export async function deleteCharge(chargeId: string): Promise<void> {
  if (!ASAAS_API_KEY) {
    throw new Error('ASAAS_API_KEY not configured');
  }

  try {
    const response = await fetch(`${ASAAS_API_URL}/payments/${chargeId}`, {
      method: 'DELETE',
      headers: {
        'access_token': ASAAS_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData: AsaasError = await response.json();
      throw new Error(
        `Failed to delete charge: ${errorData.errors?.[0]?.description || errorData.message || 'Unknown error'}`
      );
    }

    console.log('[Asaas] Charge deleted:', chargeId);
  } catch (error) {
    console.error('[Asaas] deleteCharge error:', error);
    throw error;
  }
}

/**
 * Busca uma cobrança específica
 */
export async function getCharge(chargeId: string): Promise<AsaasCharge> {
  if (!ASAAS_API_KEY) {
    throw new Error('ASAAS_API_KEY not configured');
  }

  try {
    const response = await fetch(`${ASAAS_API_URL}/payments/${chargeId}`, {
      headers: {
        'access_token': ASAAS_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData: AsaasError = await response.json();
      throw new Error(
        `Failed to get charge: ${errorData.errors?.[0]?.description || errorData.message || 'Unknown error'}`
      );
    }

    const charge: AsaasCharge = await response.json();
    return charge;
  } catch (error) {
    console.error('[Asaas] getCharge error:', error);
    throw error;
  }
}

/**
 * Mapeia status do Asaas para status interno
 */
export function mapAsaasStatus(
  asaasStatus: AsaasCharge['status']
): 'pending' | 'paid' | 'cancelled' | 'overdue' {
  switch (asaasStatus) {
    case 'RECEIVED':
    case 'CONFIRMED':
    case 'RECEIVED_IN_CASH':
      return 'paid';
    case 'OVERDUE':
      return 'overdue';
    case 'REFUNDED':
    case 'REFUND_REQUESTED':
      return 'cancelled';
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
