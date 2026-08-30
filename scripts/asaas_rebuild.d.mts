export type AsaasRebuildReport = {
  mode: string;
  generatedAt: string;
  customers: { total: number; inserted: number; updated: number };
  payments: {
    total: number;
    insertedOrUpdated: number;
    matchedLocalClients: number;
    unmatchedLocalClients: number;
  };
  statuses: Record<string, number>;
  warnings: string[];
};

export function createReport(mode?: string): AsaasRebuildReport;
export function processCustomerPage(
  customers: Array<Record<string, unknown>>,
  context: Record<string, unknown>
): Promise<void>;
export function processPaymentPage(
  payments: Array<Record<string, unknown>>,
  context: Record<string, unknown>
): Promise<void>;
export function databaseConnectionConfig(
  databaseUrl: string,
  env?: Record<string, string | undefined>
): string | { uri: string; ssl: { rejectUnauthorized: true } };

export function loadLocalState(connection: unknown): Promise<{
  clientsByEmail: Map<string, { id: number; email: string; name: string | null }>;
  customersById: Map<string, { id: number; asaas_customer_id: string; client_email: string; name: string | null }>;
}>;

export type ReconciliationFailureStage =
  | "inicializacao"
  | "clientes"
  | "pagamentos"
  | "staging";

export function runReconciliation(options: {
  apiKey: string;
  apiUrl?: string;
  databaseUrl?: string;
  apply?: boolean;
  pageTimeoutMs?: number;
  onProgress?: (resource: string, offset: number) => void;
  onError?: (stage: ReconciliationFailureStage, error: Error) => void;
  signal?: AbortSignal;
}): Promise<AsaasRebuildReport>;
