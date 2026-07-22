const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escapa texto para uso seguro dentro de HTML (ex.: nome de cliente
 * interpolado em template de email). Não usar em campos já formatados
 * internamente (datas, moeda) — apenas em texto que veio do usuário.
 */
export function escapeHtml(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  return str.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}
