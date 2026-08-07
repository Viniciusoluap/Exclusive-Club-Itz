/**
 * O arquivo financeiro não pode voltar a ficar sem verificação de tipos.
 *
 * POR QUE ESTE TESTE EXISTE: `bpoRouter.ts` carregava `// @ts-nocheck` alegando
 * divergência de tipos do drizzle no CI. Ao remover, apareceram 7 erros e
 * NENHUM era do drizzle. Dois eram defeitos reais:
 *
 *   1. `source: "asaas_reconcile"` — valor que não existia no enum da coluna.
 *      Em banco estrito (como o TiDB de produção), a reconciliação de cobrança
 *      falharia ao gravar.
 *   2. Acesso a `targetCharge.clientId` — coluna que a consulta não seleciona.
 *      O valor seria `undefined` e o saldo devedor nasceria sem cliente.
 *
 * Este é o arquivo que movimenta dinheiro. Desligar a verificação de tipos nele
 * foi como desligar o alarme do cofre — e o alarme estava certo.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { bpoCharges } from "../../drizzle/schema";

const ARQUIVO = path.join(__dirname, "bpoRouter.ts");

describe("verificação de tipos do bpoRouter", () => {
  // A diretiva de verdade é um comentário NO INÍCIO DA LINHA. Procurar só a
  // palavra pegaria as menções em prosa — inclusive as deste próprio arquivo,
  // que existem justamente para explicar por que ela não deve voltar.
  const DIRETIVA = /^\s*(?:\/\/|\/\*)\s*@ts-nocheck/m;

  it("não tem a diretiva @ts-nocheck", () => {
    expect(readFileSync(ARQUIVO, "utf8")).not.toMatch(DIRETIVA);
  });

  it("nenhum arquivo do servidor tem @ts-nocheck", () => {
    // Uma exceção vira precedente: o próximo arquivo difícil recebe o mesmo
    // tratamento e a verificação de tipos deixa de significar alguma coisa.
    const { readdirSync, statSync } = require("fs") as typeof import("fs");
    const raiz = path.join(__dirname, "..");

    const comNocheck: string[] = [];
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const caminho = path.join(dir, nome);
        if (statSync(caminho).isDirectory()) {
          if (nome !== "node_modules") varrer(caminho);
        } else if (nome.endsWith(".ts") && !nome.endsWith(".test.ts")) {
          if (DIRETIVA.test(readFileSync(caminho, "utf8"))) {
            comNocheck.push(path.relative(raiz, caminho));
          }
        }
      }
    };
    varrer(raiz);

    expect(comNocheck).toEqual([]);
  });
});

describe("valores gravados em colunas enum", () => {
  /** Valores aceitos pela coluna, lidos do próprio schema. */
  function valoresDoEnum(coluna: any): string[] {
    return (coluna?.enumValues ?? []) as string[];
  }

  it("todo `source:` escrito no bpoRouter existe no enum da coluna", () => {
    // Foi exatamente isto que falhou: o código gravava "asaas_reconcile" e a
    // coluna não conhecia esse valor. Em banco estrito, erro na hora de gravar.
    const fonte = readFileSync(ARQUIVO, "utf8");
    const permitidos = valoresDoEnum(bpoCharges.source);
    expect(permitidos.length).toBeGreaterThan(0);

    const escritos = Array.from(fonte.matchAll(/\bsource:\s*"([^"]+)"/g)).map((m) => m[1]);
    expect(escritos.length).toBeGreaterThan(0);

    const invalidos = Array.from(new Set(escritos)).filter((v) => !permitidos.includes(v));
    expect(invalidos).toEqual([]);
  });

  it("o enum de source inclui asaas_reconcile", () => {
    expect(valoresDoEnum(bpoCharges.source)).toContain("asaas_reconcile");
  });

  it("todo `classifiedBy:` escrito no bpoRouter existe no enum da coluna", () => {
    const fonte = readFileSync(ARQUIVO, "utf8");
    const permitidos = valoresDoEnum(bpoCharges.classifiedBy);
    const escritos = Array.from(fonte.matchAll(/\bclassifiedBy:\s*"([^"]+)"/g)).map((m) => m[1]);

    const invalidos = Array.from(new Set(escritos)).filter((v) => !permitidos.includes(v));
    expect(invalidos).toEqual([]);
  });
});
