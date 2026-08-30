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
