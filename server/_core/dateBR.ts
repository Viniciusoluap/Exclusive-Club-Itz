/**
 * Helpers de data no fuso de operação do clube (America/Sao_Paulo).
 *
 * Usar `new Date().toISOString().slice(0, 10)` para obter "hoje" é um bug sutil:
 * o ISO string é UTC, e à noite no Brasil (UTC-3) ele já virou o dia seguinte.
 * Toda data de negócio (vencimento, baixa, fronteira de inadimplência) precisa
 * ser calculada no fuso local, não em UTC.
 */

/** Data de hoje em America/Sao_Paulo, no formato YYYY-MM-DD. */
export function todayInSaoPaulo(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
