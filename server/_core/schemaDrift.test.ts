/**
 * A conferência de schema precisa acusar coluna perdida e ignorar coluna extra.
 *
 * ORIGEM: `0008_equal_pete_wisdom`, uma migração gerada pelo drizzle-kit no
 * servidor da hospedagem durante um deploy e aplicada ao banco de produção sem
 * revisão humana. DDL gerado por diferença pode conter `DROP COLUMN`, e não
 * havia como responder "o banco perdeu alguma coluna?".
 *
 * Os testes de comparação usam mapas montados à mão, porque o que está sob
 * teste é a REGRA. O último caso roda contra o schema real do projeto e um
 * banco MySQL de verdade, para garantir que a leitura do `schema.ts` funciona
 * com as tabelas deste sistema — e não só com um exemplo de laboratório.
 */

import { describe, expect, it } from "vitest";
import { createPool } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import { compararSchemas, tabelasEsperadas, colunasDoBanco } from "./schemaDrift";

const URL_BASE = process.env.DATABASE_URL ?? "";
const temBanco = URL_BASE.startsWith("mysql://");

function mapa(entradas: Record<string, string[]>): Map<string, Set<string>> {
  return new Map(Object.entries(entradas).map(([t, cols]) => [t, new Set(cols)]));
}

describe("comparação de schema", () => {
  it("aprova quando o banco tem exatamente o que o código espera", () => {
    const r = compararSchemas(
      mapa({ users: ["id", "email"] }),
      mapa({ users: ["id", "email"] }),
    );

    expect(r.integro).toBe(true);
    expect(r.problemas).toEqual([]);
  });

  it("ACUSA coluna que o código espera e o banco não tem", () => {
    // É este o caso que uma migração com DROP COLUMN produziria.
    const r = compararSchemas(
      mapa({ bpo_charges: ["id", "value", "amount_paid"] }),
      mapa({ bpo_charges: ["id", "value"] }),
    );

    expect(r.integro).toBe(false);
    expect(r.problemas[0].tabela).toBe("bpo_charges");
    expect(r.problemas[0].colunasFaltando).toEqual(["amount_paid"]);
  });

  it("ACUSA tabela inteira ausente", () => {
    const r = compararSchemas(mapa({ backup_attachments: ["id"] }), mapa({}));

    expect(r.integro).toBe(false);
    expect(r.problemas[0].ausente).toBe(true);
  });

  it("coluna a mais no banco NÃO é problema — só informação", () => {
    // O banco tem resíduo de versões antigas. Pintar isso de vermelho seria o
    // mesmo alarme falso que já tivemos com as variáveis de ambiente.
    const r = compararSchemas(
      mapa({ users: ["id", "email"] }),
      mapa({ users: ["id", "email", "coluna_legada"] }),
    );

    expect(r.integro).toBe(true);
    expect(r.problemas).toEqual([]);
    expect(r.extras[0].colunasExtras).toEqual(["coluna_legada"]);
  });

  it("tabela do banco que o código não declara é ignorada", () => {
    // `financial_charges` é exatamente isso: existe no banco, nenhum código usa.
    const r = compararSchemas(mapa({ users: ["id"] }), mapa({ users: ["id"], financial_charges: ["id"] }));

    expect(r.integro).toBe(true);
    expect(r.extras).toEqual([]);
  });

  it("uma tabela com coluna faltando E coluna extra conta como problema", () => {
    const r = compararSchemas(
      mapa({ users: ["id", "email"] }),
      mapa({ users: ["id", "apelido"] }),
    );

    expect(r.integro).toBe(false);
    expect(r.problemas[0].colunasFaltando).toEqual(["email"]);
    expect(r.problemas[0].colunasExtras).toEqual(["apelido"]);
  });
});

describe("leitura do schema real do projeto", () => {
  it("enxerga as tabelas do sistema, com nome físico", () => {
    // Se a leitura do schema quebrar numa versão futura do drizzle, a
    // conferência aprovaria tudo em silêncio por não encontrar nada.
    const esperado = tabelasEsperadas();

    expect(esperado.size).toBeGreaterThan(15);
    expect(esperado.has("bpo_charges")).toBe(true);
    expect(esperado.get("bpo_charges")?.has("amount_paid")).toBe(true);
    expect(esperado.has("backup_attachments")).toBe(true);
  });
});

describe.skipIf(!temBanco)("ida e volta com banco real", () => {
  it("um banco criado pelas migrações do projeto passa na conferência", async () => {
    const nome = `drift_${Date.now()}`;
    const admin = createPool(URL_BASE);
    await admin.query(`DROP DATABASE IF EXISTS \`${nome}\``);
    await admin.query(`CREATE DATABASE \`${nome}\``);
    await admin.end();

    const url = URL_BASE.replace(/\/[^/?]+(\?|$)/, `/${nome}$1`);
    const pool = createPool(url);
    const db = drizzle(pool);

    try {
      const { aplicarMigracoesPendentes } = await import("./autoMigrate");
      const r = await aplicarMigracoesPendentes(db, "drizzle");
      expect(r.erro).toBeUndefined();

      const relatorio = compararSchemas(tabelasEsperadas(), await colunasDoBanco(db));

      // O banco recém-migrado tem que bater com o schema declarado. Se não
      // bater, é a própria cadeia de migrações que está divergindo do código.
      expect(relatorio.problemas).toEqual([]);
      expect(relatorio.integro).toBe(true);
    } finally {
      await pool.end();
      const limpeza = createPool(URL_BASE);
      await limpeza.query(`DROP DATABASE IF EXISTS \`${nome}\``);
      await limpeza.end();
    }
  }, 60000);

  it("apagar uma coluna de verdade é detectado", async () => {
    const nome = `drift_drop_${Date.now()}`;
    const admin = createPool(URL_BASE);
    await admin.query(`DROP DATABASE IF EXISTS \`${nome}\``);
    await admin.query(`CREATE DATABASE \`${nome}\``);
    await admin.end();

    const url = URL_BASE.replace(/\/[^/?]+(\?|$)/, `/${nome}$1`);
    const pool = createPool(url);
    const db = drizzle(pool);

    try {
      const { aplicarMigracoesPendentes } = await import("./autoMigrate");
      await aplicarMigracoesPendentes(db, "drizzle");

      // Simula o pior efeito possível de um DDL gerado sem revisão.
      await db.execute(sql`ALTER TABLE \`bpo_charges\` DROP COLUMN \`amount_paid\``);

      const relatorio = compararSchemas(tabelasEsperadas(), await colunasDoBanco(db));

      expect(relatorio.integro).toBe(false);
      const bpo = relatorio.problemas.find((p) => p.tabela === "bpo_charges");
      expect(bpo?.colunasFaltando).toContain("amount_paid");
    } finally {
      await pool.end();
      const limpeza = createPool(URL_BASE);
      await limpeza.query(`DROP DATABASE IF EXISTS \`${nome}\``);
      await limpeza.end();
    }
  }, 60000);
});
