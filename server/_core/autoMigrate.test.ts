/**
 * A migração automática não pode destruir um banco existente.
 *
 * ESTE É O CÓDIGO COM MAIOR POTENCIAL DE ESTRAGO DE TODA A AUDITORIA: ele roda
 * DDL sozinho, na subida do servidor, contra o banco de produção. O cenário que
 * precisa ser impossível é o mais provável de todos — o banco de produção
 * recebeu seu schema por `push --force`, então a tabela de controle pode estar
 * vazia enquanto as tabelas já existem. Nesse estado, um migrador ingênuo
 * tentaria aplicar o baseline inteiro (que começa com DROP TABLE) por cima de
 * dados reais.
 *
 * Os testes rodam contra bancos MySQL de verdade, criados e descartados a cada
 * caso — não contra uma imitação. Migração é exatamente o tipo de coisa que
 * um mock aprova e o banco recusa.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import { aplicarMigracoesPendentes, lerJournal, separarInstrucoes } from "./autoMigrate";

const URL_BASE = process.env.DATABASE_URL ?? "";
const temBanco = URL_BASE.startsWith("mysql://");

/** Cria um banco descartável e devolve uma conexão drizzle para ele. */
async function bancoTemporario(nome: string) {
  const admin = createPool(URL_BASE);
  await admin.query(`DROP DATABASE IF EXISTS \`${nome}\``);
  await admin.query(`CREATE DATABASE \`${nome}\``);
  await admin.end();

  const url = URL_BASE.replace(/\/[^/?]+(\?|$)/, `/${nome}$1`);
  const pool = createPool(url);
  return { db: drizzle(pool), encerrar: async () => pool.end() };
}

async function descartarBanco(nome: string) {
  const admin = createPool(URL_BASE);
  await admin.query(`DROP DATABASE IF EXISTS \`${nome}\``);
  await admin.end();
}

/** Pasta de migrações de mentira, para controlar exatamente o que roda. */
function pastaDeMigracoes(migracoes: Array<{ tag: string; sql: string }>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "migr-"));
  fs.mkdirSync(path.join(dir, "meta"));
  fs.writeFileSync(
    path.join(dir, "meta", "_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "mysql",
      entries: migracoes.map((m, i) => ({ idx: i, version: "7", when: i, tag: m.tag, breakpoints: true })),
    }),
  );
  for (const m of migracoes) fs.writeFileSync(path.join(dir, `${m.tag}.sql`), m.sql);
  return dir;
}

const BASELINE = {
  tag: "0000_baseline",
  sql: "DROP TABLE IF EXISTS `clientes`;--> statement-breakpoint\nCREATE TABLE `clientes` (`id` int PRIMARY KEY, `nome` varchar(80));",
};
const NOVA = {
  tag: "0001_nova_coluna",
  sql: "ALTER TABLE `clientes` ADD `email` varchar(120);",
};

describe("leitura do journal", () => {
  it("respeita a ordem do índice, não a ordem alfabética do sistema de arquivos", () => {
    const dir = pastaDeMigracoes([BASELINE, NOVA]);
    try {
      expect(lerJournal(dir).map((m) => m.tag)).toEqual(["0000_baseline", "0001_nova_coluna"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ignora entradas do journal cujo arquivo .sql não existe", () => {
    const dir = pastaDeMigracoes([BASELINE]);
    try {
      fs.unlinkSync(path.join(dir, "0000_baseline.sql"));
      expect(lerJournal(dir)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("separação de instruções", () => {
  it("divide no marcador do drizzle", () => {
    expect(separarInstrucoes("CREATE TABLE a (id int);--> statement-breakpoint\nCREATE TABLE b (id int);"))
      .toHaveLength(2);
  });

  it("descarta pedaços vazios", () => {
    expect(separarInstrucoes("SELECT 1;--> statement-breakpoint\n\n  \n")).toHaveLength(1);
  });
});

describe.skipIf(!temBanco)("banco vazio (instalação nova)", () => {
  const NOME = "teste_migr_vazio";
  let ctx: Awaited<ReturnType<typeof bancoTemporario>>;

  beforeEach(async () => { ctx = await bancoTemporario(NOME); });
  afterEach(async () => { await ctx.encerrar(); await descartarBanco(NOME); });

  it("aplica todas as migrações de verdade", async () => {
    const dir = pastaDeMigracoes([BASELINE, NOVA]);
    try {
      const r = await aplicarMigracoesPendentes(ctx.db, dir);

      expect(r.situacao).toBe("banco-novo");
      expect(r.aplicadas).toEqual(["0000_baseline", "0001_nova_coluna"]);
      expect(r.marcadasSemExecutar).toEqual([]);

      const [cols]: any = await ctx.db.execute(sql`SHOW COLUMNS FROM clientes`);
      expect(cols.map((c: any) => c.Field)).toContain("email");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!temBanco)("banco existente sem histórico (o caso da produção)", () => {
  const NOME = "teste_migr_adocao";
  let ctx: Awaited<ReturnType<typeof bancoTemporario>>;

  beforeEach(async () => {
    ctx = await bancoTemporario(NOME);
    // Simula produção: schema criado por `push --force`, com DADOS REAIS, e
    // nenhuma tabela de controle de migrações.
    await ctx.db.execute(sql`CREATE TABLE clientes (id int PRIMARY KEY, nome varchar(80))`);
    await ctx.db.execute(sql`INSERT INTO clientes (id, nome) VALUES (1, 'Cliente Existente')`);
  });
  afterEach(async () => { await ctx.encerrar(); await descartarBanco(NOME); });

  it("NÃO executa o baseline por cima dos dados — marca sem rodar", async () => {
    // Se o baseline rodasse, o DROP TABLE apagaria o cliente. Esta é a asserção
    // mais importante de todo o arquivo.
    const dir = pastaDeMigracoes([BASELINE]);
    try {
      const r = await aplicarMigracoesPendentes(ctx.db, dir);

      expect(r.situacao).toBe("baseline-adotado");
      expect(r.aplicadas).toEqual([]);
      expect(r.marcadasSemExecutar).toEqual(["0000_baseline"]);

      const [linhas]: any = await ctx.db.execute(sql`SELECT nome FROM clientes`);
      expect(linhas).toHaveLength(1);
      expect(linhas[0].nome).toBe("Cliente Existente");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("depois da adoção, migrações NOVAS rodam normalmente", async () => {
    // É isto que encerra a pilha de remendos: uma vez adotado, o schema volta
    // a evoluir sozinho.
    const dir1 = pastaDeMigracoes([BASELINE]);
    const dir2 = pastaDeMigracoes([BASELINE, NOVA]);
    try {
      await aplicarMigracoesPendentes(ctx.db, dir1);
      const r = await aplicarMigracoesPendentes(ctx.db, dir2);

      expect(r.aplicadas).toEqual(["0001_nova_coluna"]);

      const [cols]: any = await ctx.db.execute(sql`SHOW COLUMNS FROM clientes`);
      expect(cols.map((c: any) => c.Field)).toContain("email");

      // E os dados continuam lá.
      const [linhas]: any = await ctx.db.execute(sql`SELECT nome FROM clientes`);
      expect(linhas).toHaveLength(1);
    } finally {
      fs.rmSync(dir1, { recursive: true, force: true });
      fs.rmSync(dir2, { recursive: true, force: true });
    }
  });

  it("rodar duas vezes seguidas não repete nada", async () => {
    const dir = pastaDeMigracoes([BASELINE, NOVA]);
    try {
      await aplicarMigracoesPendentes(ctx.db, dir);
      const segunda = await aplicarMigracoesPendentes(ctx.db, dir);

      expect(segunda.aplicadas).toEqual([]);
      expect(segunda.marcadasSemExecutar).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!temBanco)("resistência a falhas", () => {
  const NOME = "teste_migr_falha";
  let ctx: Awaited<ReturnType<typeof bancoTemporario>>;

  beforeEach(async () => { ctx = await bancoTemporario(NOME); });
  afterEach(async () => { await ctx.encerrar(); await descartarBanco(NOME); });

  it("uma migração inválida NÃO derruba o servidor — devolve o erro", async () => {
    // Servidor que não sobe é pior que migração pendente: o sistema inteiro
    // fica fora do ar por causa de uma coluna.
    const dir = pastaDeMigracoes([{ tag: "0000_quebrada", sql: "ISTO NÃO É SQL VÁLIDO;" }]);
    try {
      const r = await aplicarMigracoesPendentes(ctx.db, dir);

      expect(r.situacao).toBe("indisponivel");
      expect(r.erro).toBeTruthy();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uma migração que falha não fica marcada como aplicada", async () => {
    // Se ficasse, a correção nunca rodaria depois — o defeito viraria permanente.
    const dir = pastaDeMigracoes([{ tag: "0000_quebrada", sql: "ISTO NÃO É SQL VÁLIDO;" }]);
    try {
      await aplicarMigracoesPendentes(ctx.db, dir);
      const [linhas]: any = await ctx.db.execute(sql`SELECT COUNT(*) AS t FROM \`__drizzle_migrations\``);
      expect(Number(linhas[0].t)).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

/**
 * O estado REAL do banco de produção, descoberto em 13/08.
 *
 * A tabela de controle tinha 13 registros — hashes do conjunto ANTIGO de
 * migrações, que a Story 6 substituiu por um baseline novo de 8. São órfãos:
 * não correspondem a nenhum arquivo existente. A condição de adoção exigia
 * histórico VAZIO, então nunca adotava: o migrador tentava criar tabelas que já
 * existiam e falhava em toda subida do servidor, silenciosamente, desde 07/08.
 */
describe.skipIf(!temBanco)("banco com histórico órfão (o caso real da produção)", () => {
  const NOME = "teste_migr_orfao";
  let ctx: Awaited<ReturnType<typeof bancoTemporario>>;

  beforeEach(async () => { ctx = await bancoTemporario(NOME); });
  afterEach(async () => { await ctx.encerrar(); await descartarBanco(NOME); });

  /** Reproduz produção: tabelas com dados + controle cheio de hashes de outro conjunto. */
  async function prepararProducao() {
    await ctx.db.execute(sql`CREATE TABLE \`clientes\` (\`id\` int PRIMARY KEY, \`nome\` varchar(80))`);
    await ctx.db.execute(sql`INSERT INTO \`clientes\` VALUES (1, 'Ana Souza')`);
    await ctx.db.execute(sql`
      CREATE TABLE \`__drizzle_migrations\` (
        \`id\` serial PRIMARY KEY, \`hash\` text NOT NULL, \`created_at\` bigint
      )
    `);
    for (let i = 0; i < 13; i++) {
      await ctx.db.execute(
        sql`INSERT INTO \`__drizzle_migrations\` (\`hash\`, \`created_at\`) VALUES (${"orfao-" + i}, ${Date.now()})`,
      );
    }
  }

  it("adota o baseline mesmo com histórico órfão, e o dado sobrevive", async () => {
    await prepararProducao();
    const dir = pastaDeMigracoes([BASELINE, NOVA]);
    try {
      const r = await aplicarMigracoesPendentes(ctx.db, dir);

      expect(r.situacao).toBe("baseline-adotado");
      expect(r.erro).toBeUndefined();
      // O baseline (que começa com DROP TABLE) NÃO pode ter sido executado.
      expect(r.marcadasSemExecutar).toEqual(["0000_baseline"]);

      const [linhas]: any = await ctx.db.execute(sql`SELECT nome FROM clientes`);
      expect(linhas).toHaveLength(1);
      expect(linhas[0].nome).toBe("Ana Souza");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a migração incremental É executada — adotar não pode virar ignorar", async () => {
    // Marcar tudo como aplicado deixaria o banco sem índices, sem constraints e
    // sem valores de enum que ninguém sabe se chegaram a existir.
    await prepararProducao();
    const dir = pastaDeMigracoes([BASELINE, NOVA]);
    try {
      const r = await aplicarMigracoesPendentes(ctx.db, dir);

      expect(r.aplicadas).toEqual(["0001_nova_coluna"]);

      const [cols]: any = await ctx.db.execute(sql`SHOW COLUMNS FROM clientes`);
      expect(cols.map((c: any) => c.Field)).toContain("email");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("instrução cujo objeto já existe é trabalho feito, não falha", async () => {
    // Durante a auditoria, vários objetos foram criados à mão no banco porque as
    // migrações não chegavam nele. A migração que os declara precisa conviver
    // com isso em vez de abortar tudo.
    await prepararProducao();
    await ctx.db.execute(sql`ALTER TABLE \`clientes\` ADD \`email\` varchar(120)`);

    const dir = pastaDeMigracoes([BASELINE, NOVA]);
    try {
      const r = await aplicarMigracoesPendentes(ctx.db, dir);

      expect(r.erro).toBeUndefined();
      expect(r.aplicadas).toEqual(["0001_nova_coluna"]);
      expect(r.jaSatisfeitas.join(" ")).toContain("0001_nova_coluna");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("erro de VERDADE continua estourando — tolerância não é cegueira", async () => {
    await prepararProducao();
    const QUEBRADA = { tag: "0001_quebrada", sql: "ALTER TABLE `clientes` ADD `x` tipo_que_nao_existe;" };

    const dir = pastaDeMigracoes([BASELINE, QUEBRADA]);
    try {
      const r = await aplicarMigracoesPendentes(ctx.db, dir);

      expect(r.situacao).toBe("indisponivel");
      expect(r.erro).toBeTruthy();
      expect(r.aplicadas).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("na segunda subida não refaz nada", async () => {
    await prepararProducao();
    const dir = pastaDeMigracoes([BASELINE, NOVA]);
    try {
      await aplicarMigracoesPendentes(ctx.db, dir);
      const segunda = await aplicarMigracoesPendentes(ctx.db, dir);

      expect(segunda.situacao).toBe("ja-controlado");
      expect(segunda.aplicadas).toEqual([]);
      expect(segunda.marcadasSemExecutar).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
