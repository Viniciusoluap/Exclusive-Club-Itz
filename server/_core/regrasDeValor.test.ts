/**
 * A conferência de valores precisa achar o que está errado e calar sobre o que
 * está certo. Os dois lados são testados contra um MySQL de verdade, porque o
 * que está sendo verificado é uma consulta SQL — e SQL é exatamente o tipo de
 * coisa que um mock aprova e o banco recusa.
 */

import { describe, expect, it, afterEach } from "vitest";
import { createPool } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import { conferirValores, REGRAS, textoDaRegra, condicaoDeViolacao } from "./regrasDeValor";

const URL_BASE = process.env.DATABASE_URL ?? "";
const temBanco = URL_BASE.startsWith("mysql://");

const criados: string[] = [];

async function bancoComTabelas(sqls: string[]) {
  const nome = `valores_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const admin = createPool(URL_BASE);
  await admin.query(`DROP DATABASE IF EXISTS \`${nome}\``);
  await admin.query(`CREATE DATABASE \`${nome}\``);
  await admin.end();
  criados.push(nome);

  const pool = createPool(URL_BASE.replace(/\/[^/?]+(\?|$)/, `/${nome}$1`));
  for (const s of sqls) await pool.query(s);
  return { db: drizzle(pool), encerrar: () => pool.end() };
}

afterEach(async () => {
  if (!temBanco) return;
  const admin = createPool(URL_BASE);
  for (const nome of criados.splice(0)) await admin.query(`DROP DATABASE IF EXISTS \`${nome}\``);
  await admin.end();
});

describe("catálogo de regras", () => {
  it("cobre os valores financeiros que importam", () => {
    const alvos = REGRAS.map((r) => `${r.tabela}.${r.coluna}`);

    expect(alvos).toContain("bpo_charges.value");
    expect(alvos).toContain("bpo_charges.amount_paid");
    expect(alvos).toContain("expense_records.amount");
  });

  it("NÃO trata estoque de combustível como erro", () => {
    // O estoque pode ficar negativo de propósito quando o consumo passa do
    // comprado, e o cálculo de saldo do orçamento depende disso. Incluir essa
    // coluna produziria alarme permanente sobre comportamento correto.
    const alvos = REGRAS.map((r) => `${r.tabela}.${r.coluna}`);

    expect(alvos).not.toContain("fuel_budget.stock_liters");
    expect(alvos).not.toContain("gallon_stock.stock_liters");
  });

  it("descreve cada regra em português", () => {
    expect(textoDaRegra("naoNegativo")).toBe("não pode ser negativo");
    expect(textoDaRegra("percentual")).toBe("entre 0 e 100");
    for (const r of REGRAS) expect(r.descricao.length).toBeGreaterThan(3);
  });
});

describe("condição SQL de violação", () => {
  it("NULL nunca conta como fora de faixa", () => {
    // Coluna vazia é outra discussão (obrigatoriedade), não faixa de valor.
    // Sem isso, toda cobrança sem valor líquido viraria violação.
    const c = condicaoDeViolacao({
      tabela: "t", coluna: "net_value", tipo: "naoNegativo", descricao: "x",
    });

    expect(c).toContain("IS NOT NULL");
  });

  it("percentual limita os dois lados", () => {
    const c = condicaoDeViolacao({
      tabela: "t", coluna: "progress_percent", tipo: "percentual", descricao: "x",
    });

    expect(c).toContain("< 0");
    expect(c).toContain("> 100");
  });
});

describe.skipIf(!temBanco)("conferência contra banco real", () => {
  it("banco limpo passa sem violação nenhuma", async () => {
    const ctx = await bancoComTabelas([
      "CREATE TABLE `bpo_charges` (`id` INT PRIMARY KEY, `value` DECIMAL(10,2), `amount_paid` DECIMAL(10,2), `net_value` DECIMAL(10,2))",
      "INSERT INTO `bpo_charges` VALUES (1, 1000.00, 400.00, 980.00), (2, 50.00, 0.00, NULL)",
    ]);

    try {
      const r = await conferirValores(ctx.db);

      expect(r.erro).toBeUndefined();
      expect(r.integro).toBe(true);
      expect(r.violacoes).toEqual([]);
      // O `net_value` NULL da segunda linha não pode ter virado violação.
      expect(r.regrasConferidas).toBeGreaterThan(0);
    } finally {
      await ctx.encerrar();
    }
  }, 30000);

  it("acusa valor negativo, com a contagem certa", async () => {
    const ctx = await bancoComTabelas([
      "CREATE TABLE `bpo_charges` (`id` INT PRIMARY KEY, `value` DECIMAL(10,2), `amount_paid` DECIMAL(10,2), `net_value` DECIMAL(10,2))",
      "INSERT INTO `bpo_charges` VALUES (1, -10.00, 0.00, NULL), (2, -5.00, 0.00, NULL), (3, 100.00, -1.00, NULL)",
    ]);

    try {
      const r = await conferirValores(ctx.db);

      expect(r.integro).toBe(false);

      const valor = r.violacoes.find((v) => v.coluna === "value");
      expect(valor?.linhasForaDaFaixa).toBe(2);

      const recebido = r.violacoes.find((v) => v.coluna === "amount_paid");
      expect(recebido?.linhasForaDaFaixa).toBe(1);
    } finally {
      await ctx.encerrar();
    }
  }, 30000);

  it("percentual acima de 100 é acusado", async () => {
    const ctx = await bancoComTabelas([
      "CREATE TABLE `backup_history` (`id` INT PRIMARY KEY, `progress_percent` INT)",
      "INSERT INTO `backup_history` VALUES (1, 50), (2, 150), (3, -1), (4, NULL)",
    ]);

    try {
      const r = await conferirValores(ctx.db);
      const p = r.violacoes.find((v) => v.coluna === "progress_percent");

      expect(p?.linhasForaDaFaixa).toBe(2);
      expect(p?.regra).toBe("entre 0 e 100");
    } finally {
      await ctx.encerrar();
    }
  }, 30000);

  it("tabela que não existe no banco é ignorada, sem erro", async () => {
    // O banco tem resíduo e o código tem regras para tabelas que nem todo
    // ambiente possui. Uma regra órfã não pode derrubar a conferência inteira.
    const ctx = await bancoComTabelas([
      "CREATE TABLE `bpo_charges` (`id` INT PRIMARY KEY, `value` DECIMAL(10,2), `amount_paid` DECIMAL(10,2), `net_value` DECIMAL(10,2))",
    ]);

    try {
      const r = await conferirValores(ctx.db);

      expect(r.erro).toBeUndefined();
      expect(r.regrasConferidas).toBe(3); // só as três de bpo_charges
    } finally {
      await ctx.encerrar();
    }
  }, 30000);

  it("banco sem nenhuma das tabelas conhecidas não quebra", async () => {
    const ctx = await bancoComTabelas(["CREATE TABLE `outra_coisa` (`id` INT PRIMARY KEY)"]);

    try {
      const r = await conferirValores(ctx.db);

      expect(r.erro).toBeUndefined();
      expect(r.regrasConferidas).toBe(0);
      expect(r.integro).toBe(true);
    } finally {
      await ctx.encerrar();
    }
  }, 30000);
});
