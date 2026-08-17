/**
 * A conferência de contas acusa erro de unidade de verdade (Story 33 / DB-19).
 *
 * O alvo não é diferença de centavo — é erro de FATOR 100, que é o que uma
 * conversão perdida entre reais e centavos produz. Estes testes montam os dois
 * cenários num banco de verdade e cobram que a conferência saiba distinguir um
 * do outro.
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";
import { conferirContas } from "./conferenciaDeContas";

const URL_BASE = process.env.DATABASE_URL ?? "";
const temBanco = URL_BASE.startsWith("mysql://");
const NOME = "conferencia_de_contas_test";

let pool: any;
let db: any;

async function inserir(liters: number, preco: number, total: number) {
  await pool.query(
    "INSERT INTO fuel_records (liters, price_per_liter, total_amount) VALUES (?, ?, ?)",
    [liters, preco, total],
  );
}

describe.skipIf(!temBanco)("conferência de contas do abastecimento", () => {
  beforeAll(async () => {
    const admin = createPool(URL_BASE);
    await admin.query(`DROP DATABASE IF EXISTS \`${NOME}\``);
    await admin.query(`CREATE DATABASE \`${NOME}\``);
    await admin.end();

    pool = createPool(URL_BASE.replace(/\/[^/?]+(\?|$)/, `/${NOME}$1`));
    // Só as colunas que a conferência lê — tabela de mentira, de propósito:
    // o que se testa é a conta, não o schema completo.
    await pool.query(`
      CREATE TABLE fuel_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        liters INT,
        price_per_liter INT,
        total_amount INT
      )
    `);
    db = drizzle(pool);
  });

  afterAll(async () => {
    await pool?.end();
    const admin = createPool(URL_BASE);
    await admin.query(`DROP DATABASE IF EXISTS \`${NOME}\``);
    await admin.end();
  });

  it("banco vazio é íntegro", async () => {
    const r = await conferirContas(db);
    expect(r.integro).toBe(true);
    expect(r.registrosConferidos).toBe(0);
  });

  it("um abastecimento correto não acusa nada", async () => {
    // 25,5 L a R$ 6,50 = R$ 165,75 de combustível + R$ 10,00 de taxa.
    // É o mesmo caso que o teste de ponta a ponta grava pela tela.
    await inserir(2550, 650, 17575);

    const r = await conferirContas(db);
    expect(r.registrosConferidos).toBe(1);
    expect(r.integro).toBe(true);
  });

  it("total 100x menor (conversão perdida) é acusado", async () => {
    // O erro clássico: gravar reais onde se esperava centavos.
    await inserir(2550, 650, 175);

    const r = await conferirContas(db);
    expect(r.integro).toBe(false);
    const acusado = r.divergentes.find((d) => d.totalGravado === 175);
    expect(acusado).toBeDefined();
    expect(acusado!.totalRecalculado).toBe(16575);
  });

  it("total 100x maior também é acusado", async () => {
    await inserir(2550, 650, 1757500);

    const r = await conferirContas(db);
    const acusado = r.divergentes.find((d) => d.totalGravado === 1757500);
    expect(acusado).toBeDefined();
  });

  /**
   * A contraprova. Sem ela, uma conferência que acusasse TUDO passaria nos
   * testes acima e ninguém notaria — a tela ficaria vermelha para sempre e
   * acabaria ignorada, que é o pior destino de um alarme.
   */
  it("variação de taxa dentro da folga NÃO é acusada", async () => {
    // Mesma conta, taxa diferente (R$ 25,00 em vez de R$ 10,00).
    await inserir(1000, 500, 5000 + 2500);

    const r = await conferirContas(db);
    const falsoAlarme = r.divergentes.find((d) => d.totalGravado === 7500);
    expect(falsoAlarme).toBeUndefined();
  });
});
