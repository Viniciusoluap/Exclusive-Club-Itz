/**
 * Fuso das datas de negócio.
 *
 * Bug que motivou estes testes: a tela de backups exibia "em cerca de 3 horas"
 * para um backup recém-iniciado. A coluna é timestamp(mode:'string'), então o
 * MySQL devolve "2026-08-03 01:13:46" sem marcador de fuso; o navegador
 * interpretava como horário local e o instante UTC aparecia adiantado em 3h.
 */

import { describe, expect, it } from "vitest";
import { createPool } from "mysql2/promise";
import { toIsoUtc, todayInSaoPaulo, toMysqlDatetime } from "./dateBR";

const URL_BASE = process.env.DATABASE_URL ?? "";
const temBanco = URL_BASE.startsWith("mysql://");

describe("toIsoUtc", () => {
  it("trata datetime ingênuo do MySQL como UTC", () => {
    // Era exatamente o caso da tela: 01:13 UTC = 22:13 do dia anterior em SP.
    expect(toIsoUtc("2026-08-03 01:13:46")).toBe("2026-08-03T01:13:46.000Z");
  });

  it("o valor normalizado converte para o horário correto de São Paulo", () => {
    const iso = toIsoUtc("2026-08-03 01:13:46")!;
    const emSaoPaulo = new Date(iso).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });
    // UTC-3: 01:13 do dia 03 vira 22:13 do dia 02 — no passado, não no futuro.
    expect(emSaoPaulo).toContain("02/08/2026");
    expect(emSaoPaulo).toContain("22:13");
  });

  it("preserva valores que já trazem fuso explícito", () => {
    expect(toIsoUtc("2026-08-03T01:13:46.000Z")).toBe("2026-08-03T01:13:46.000Z");
    expect(toIsoUtc("2026-08-02T22:13:46-03:00")).toBe("2026-08-02T22:13:46-03:00");
  });

  it("aceita Date e devolve ISO", () => {
    expect(toIsoUtc(new Date("2026-08-03T01:13:46.000Z"))).toBe(
      "2026-08-03T01:13:46.000Z",
    );
  });

  it("devolve null para ausente e não quebra com lixo", () => {
    expect(toIsoUtc(null)).toBeNull();
    expect(toIsoUtc(undefined)).toBeNull();
    expect(toIsoUtc("")).toBeNull();
    expect(toIsoUtc("não é data")).toBe("não é data");
  });
});

describe("todayInSaoPaulo", () => {
  it("retorna YYYY-MM-DD", () => {
    expect(todayInSaoPaulo()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("toMysqlDatetime", () => {
  it("produz 'YYYY-MM-DD HH:MM:SS', sem T, Z ou milissegundos", () => {
    expect(toMysqlDatetime(new Date("2026-08-15T18:19:22.159Z"))).toBe(
      "2026-08-15 18:19:22",
    );
  });

  it("sem argumento, usa o instante atual", () => {
    expect(toMysqlDatetime()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  /**
   * Bug que motivou esta função: `authenticateRequest()` gravava
   * `lastSignedIn` com `new Date().toISOString()` cru. Contra um MySQL em modo
   * estrito (padrão desde a 5.7), isso falha com ER_TRUNCATED_WRONG_VALUE — e
   * como `createContext()` engole qualquer erro de `authenticateRequest()`
   * como "sessão inválida", todo login virava silenciosamente "deslogado". O
   * TiDB de produção tolera o formato malformado, por isso o bug nunca
   * apareceu lá — e é exatamente por isso que o CI (que roda TiDB efêmero, de
   * propósito, para ser fiel à produção) não pode ser usado para provar que o
   * ISO cru É rejeitado: ali ele não é. Essa prova só vale contra MySQL de
   * verdade; contra TiDB ela é pulada.
   *
   * Os testes abaixo rodam contra um banco de verdade, não uma imitação: é
   * exatamente o tipo de rejeição que um mock aprovaria e o MySQL recusa.
   */
  describe.skipIf(!temBanco)("contra um banco real", () => {
    async function bancoTemporario() {
      const nome = "dateBR_toMysqlDatetime_test";
      const admin = createPool(URL_BASE);
      await admin.query(`DROP DATABASE IF EXISTS \`${nome}\``);
      await admin.query(`CREATE DATABASE \`${nome}\``);
      await admin.end();

      const url = URL_BASE.replace(/\/[^/?]+(\?|$)/, `/${nome}$1`);
      const pool = createPool(url);
      await pool.query("CREATE TABLE t (momento TIMESTAMP NOT NULL)");
      return {
        pool,
        encerrar: async () => {
          await pool.end();
          const dropAdmin = createPool(URL_BASE);
          await dropAdmin.query(`DROP DATABASE IF EXISTS \`${nome}\``);
          await dropAdmin.end();
        },
      };
    }

    async function ehTiDB(pool: ReturnType<typeof createPool>): Promise<boolean> {
      const [linhas]: any = await pool.query("SELECT VERSION() AS versao");
      return /tidb/i.test(String(linhas[0]?.versao ?? ""));
    }

    it("num MySQL estrito, um ISO string cru (o bug) é rejeitado — prova que o bug é real", async () => {
      const { pool, encerrar } = await bancoTemporario();
      try {
        if (await ehTiDB(pool)) return; // divergência documentada e esperada — ver comentário acima
        await expect(
          pool.query("INSERT INTO t (momento) VALUES (?)", [new Date().toISOString()]),
        ).rejects.toThrow(/Incorrect datetime|Truncated/i);
      } finally {
        await encerrar();
      }
    });

    it("toMysqlDatetime() é aceito — prova que a correção resolve", async () => {
      const { pool, encerrar } = await bancoTemporario();
      try {
        await pool.query("INSERT INTO t (momento) VALUES (?)", [toMysqlDatetime()]);
        const [linhas]: any = await pool.query("SELECT COUNT(*) AS total FROM t");
        expect(Number(linhas[0].total)).toBe(1);
      } finally {
        await encerrar();
      }
    });
  });
});
