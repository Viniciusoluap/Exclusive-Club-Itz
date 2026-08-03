/**
 * Helpers de data no fuso de operação do clube (America/Sao_Paulo).
 *
 * Usar `new Date().toISOString().slice(0, 10)` para obter "hoje" é um bug sutil:
 * o ISO string é UTC, e à noite no Brasil (UTC-3) ele já virou o dia seguinte.
 * Toda data de negócio (vencimento, baixa, fronteira de inadimplência) precisa
 * ser calculada no fuso local, não em UTC.
 */

/**
 * Normaliza um datetime "ingênuo" vindo do MySQL para ISO-8601 UTC explícito.
 *
 * Colunas `timestamp(mode: 'string')` voltam do driver como "2026-08-03 01:13:46",
 * sem qualquer marcador de fuso. No navegador, `new Date("2026-08-03 01:13:46")`
 * interpreta isso como horário LOCAL — então um instante gravado em UTC aparece
 * na tela como se já fosse horário de Brasília, adiantado em 3 horas. Era o que
 * fazia a tela de backups exibir "em cerca de 3 horas" para algo que acabara de
 * começar.
 *
 * Acrescentando o "Z", o valor volta a ser inequívoco e o front pode converter
 * corretamente para America/Sao_Paulo.
 */
export function toIsoUtc(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();

  const raw = String(value).trim();
  if (raw.length === 0) return null;

  // Já tem fuso explícito (Z ou ±hh:mm) — devolve como está.
  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)) return raw;

  const isoish = raw.replace(" ", "T");
  const parsed = new Date(`${isoish}Z`);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

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
