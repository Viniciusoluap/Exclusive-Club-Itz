export const ENV = {
  appId: process.env.VITE_APP_ID ?? process.env.APP_ID ?? "exclusive-club",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  asaasApiKey: process.env.ASAAS_API_KEY ?? "",
  asaasWebhookToken: process.env.ASAAS_WEBHOOK_TOKEN ?? "",
  initialAdminEmail: process.env.INITIAL_ADMIN_EMAIL ?? "",
  initialAdminPassword: process.env.INITIAL_ADMIN_PASSWORD ?? "",
  initialAdminName: process.env.INITIAL_ADMIN_NAME ?? "Administrador",
};
