/**
 * Story 2 (Fase 0 / E-1) — Erradicação de injeção SQL de 2ª ordem via client_email.
 * Débitos: DB-02 (interpolação de string em sql.raw) + DB-16 (escape manual frágil).
 *
 * CONTEXTO: o email do usuário logado (`ctx.user.email`) é MUTÁVEL (existe
 * `updateUserEmail` em server/db.ts). Antes desta correção, ele era interpolado
 * diretamente em `sql.raw()` (ex.: `WHERE client_email = '${ctx.user.email}'`),
 * permitindo que um atacante trocasse o próprio email por um payload de injeção e,
 * na próxima query escopada por dono, vazasse/alterasse dados de OUTROS clientes.
 *
 * Não há DATABASE_URL neste ambiente, então NÃO testamos contra banco real. Em vez
 * disso validamos o CONTRATO de construção da query: o email malicioso vira um
 * bind param (`?`) — nunca texto SQL. Um teste de regressão adicional varre
 * server/routers.ts garantindo que a interpolação insegura não retorne.
 */

import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dialect = new MySqlDialect();
const compile = (query: Parameters<typeof dialect.sqlToQuery>[0]) =>
  dialect.sqlToQuery(query);

// Payloads clássicos de injeção de 2ª ordem que um usuário poderia gravar como email.
const MALICIOUS_EMAILS = [
  "x' OR '1'='1",
  "x'; DROP TABLE users;--",
  "x' UNION SELECT email, password_hash FROM users--",
  "' OR client_email LIKE '%",
  "attacker@evil.com' OR '1'='1",
  "x'/**/OR/**/'1'='1", // ofuscação com comentário
];

describe("SQLi 2ª ordem via client_email — parametrização (DB-02/DB-16)", () => {
  it("interpola o email como bind param, nunca como texto SQL", () => {
    for (const payload of MALICIOUS_EMAILS) {
      const query = compile(
        sql`SELECT id FROM inspection_charges WHERE client_email = ${payload}`,
      );

      // A query construída usa placeholder, não o valor literal.
      expect(query.sql).toContain("?");
      // O payload NÃO aparece no texto SQL (não altera a estrutura da query).
      expect(query.sql).not.toContain(payload);
      expect(query.sql).not.toContain("OR '1'='1");
      expect(query.sql).not.toContain("DROP TABLE");
      expect(query.sql).not.toContain("UNION SELECT");
      // O valor é transportado como parâmetro vinculado.
      expect(query.params).toContain(payload);
      expect(query.params).toHaveLength(1);
    }
  });

  it("query escopada por dono continua com estrutura fixa sob qualquer email", () => {
    const structural = MALICIOUS_EMAILS.map(
      (payload) =>
        compile(
          sql`SELECT * FROM bpo_charges WHERE client_email = ${payload} AND status = 'overdue'`,
        ).sql,
    );
    // Todas as variações produzem EXATAMENTE o mesmo SQL — o email não muda a query.
    expect(new Set(structural).size).toBe(1);
    expect(structural[0]).toBe(
      "SELECT * FROM bpo_charges WHERE client_email = ? AND status = 'overdue'",
    );
  });

  it("lista IN (...) de ids via sql.join também parametriza cada valor", () => {
    const chargeIds = [1, 2, 3];
    const idParams = sql.join(
      chargeIds.map((id) => sql`${id}`),
      sql`, `,
    );
    const query = compile(
      sql`SELECT id FROM bpo_charges WHERE id IN (${idParams}) AND client_email = ${"attacker@evil.com' OR '1'='1"}`,
    );
    expect(query.sql).toContain("IN (?, ?, ?)");
    expect(query.params).toEqual([1, 2, 3, "attacker@evil.com' OR '1'='1"]);
  });

  it("controle negativo: sql.raw NÃO parametriza — documenta o vetor eliminado", () => {
    const payload = "x' OR '1'='1";
    const unsafe = compile(
      sql.raw(`SELECT id FROM t WHERE client_email = '${payload}'`),
    );
    // Exatamente o comportamento perigoso removido nesta story: payload vira SQL.
    expect(unsafe.sql).toContain("OR '1'='1");
    expect(unsafe.params).toHaveLength(0);
  });
});

describe("Regressão: routers sem interpolação de email em SQL", () => {
  const serverDir = path.dirname(fileURLToPath(import.meta.url));

  /**
   * Varre server/routers.ts E todos os routers extraídos em server/routers/.
   *
   * A decomposição de routers.ts (Story 40 / SYS-03) move handlers para arquivos
   * dedicados. Se este guard olhasse só para routers.ts, cada extração encolheria
   * silenciosamente a cobertura: o código movido deixaria de ser verificado
   * justamente por ter mudado de arquivo. Varrer o diretório inteiro mantém a
   * garantia sobre toda a superfície de routers, inclusive os que já haviam sido
   * extraídos antes desta story (bpoRouter, expensesRouter, etc.).
   */
  const routerFiles = [
    path.join(serverDir, "routers.ts"),
    ...readdirSync(path.join(serverDir, "routers"))
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .sort()
      .map((f) => path.join(serverDir, "routers", f)),
  ];
  const source = routerFiles
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

  const FORBIDDEN: Array<[string, RegExp]> = [
    ["client_email = '${...}'", /client_email\s*=\s*'\$\{/],
    ["ac.email = '${...}'", /\bac\.email\s*=\s*'\$\{/],
    ["processed_by = '${...}'", /processed_by\s*=\s*'\$\{/],
    ["admin_response = '${...}'", /admin_response\s*=\s*'\$\{/],
    ["variável de escape manual de email (emailEsc/clientEmailEsc)", /\b(?:email|clientEmail)Esc\d*\b/],
  ];

  for (const [label, re] of FORBIDDEN) {
    it(`não reintroduz padrão inseguro: ${label}`, () => {
      expect(re.test(source)).toBe(false);
    });
  }

  it("as leituras escopadas por dono usam ${ctx.user.email} parametrizado", () => {
    const parametrized =
      source.match(/client_email = \$\{ctx\.user\.email\}/g) || [];
    // Portal do cliente: várias leituras escopadas por dono, todas parametrizadas.
    expect(parametrized.length).toBeGreaterThanOrEqual(3);
  });
});
