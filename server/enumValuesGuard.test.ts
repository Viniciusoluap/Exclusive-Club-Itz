/**
 * Nenhum código pode gravar um valor que a coluna não aceita.
 *
 * POR QUE ISTO EXISTE: ao remover o `@ts-nocheck` do `bpoRouter.ts`, apareceu um
 * defeito real — o código gravava `source: "asaas_reconcile"` numa coluna cujo
 * enum não conhecia esse valor. Em banco estrito, como o TiDB de produção, isso
 * é erro na hora de gravar: a reconciliação de cobrança falharia.
 *
 * Aquele defeito foi encontrado por acaso, porque alguém removeu uma diretiva.
 * Esta varredura procura a MESMA CLASSE de erro em todo o servidor, sem depender
 * de sorte — inclusive nos arquivos onde o TypeScript não consegue inferir o
 * tipo (consultas com `sql` cru, objetos montados dinamicamente, `any`).
 *
 * O que ela cobre e o TypeScript não: literais dentro de SQL cru e atribuições
 * em objetos tipados como `any`, que é justamente onde o compilador se cala.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import * as schema from "../drizzle/schema";

/** Mapeia nome da propriedade → valores aceitos, varrendo o schema inteiro. */
function colunasEnum(): Map<string, { valores: string[]; tabelas: string[] }> {
  const mapa = new Map<string, { valores: string[]; tabelas: string[] }>();

  for (const [nomeTabela, tabela] of Object.entries(schema as Record<string, any>)) {
    if (!tabela || typeof tabela !== "object") continue;

    for (const [nomeProp, coluna] of Object.entries(tabela as Record<string, any>)) {
      const valores = coluna?.enumValues;
      if (!Array.isArray(valores) || valores.length === 0) continue;

      const existente = mapa.get(nomeProp);
      if (existente) {
        // Mesma propriedade em tabelas diferentes: a união é o conjunto seguro.
        // Restringir a uma só acusaria falso positivo em quem usa a outra.
        for (const v of valores) if (!existente.valores.includes(v)) existente.valores.push(v);
        existente.tabelas.push(nomeTabela);
      } else {
        mapa.set(nomeProp, { valores: [...valores], tabelas: [nomeTabela] });
      }
    }
  }

  return mapa;
}

function arquivosDoServidor(): string[] {
  const raiz = path.join(__dirname);
  const encontrados: string[] = [];

  const varrer = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const caminho = path.join(dir, nome);
      if (statSync(caminho).isDirectory()) {
        if (nome !== "node_modules" && nome !== "scripts") varrer(caminho);
      } else if (nome.endsWith(".ts") && !nome.endsWith(".test.ts")) {
        encontrados.push(caminho);
      }
    }
  };
  varrer(raiz);
  return encontrados;
}

/**
 * Recorta os objetos passados a `.set({...})` e `.values({...})`.
 *
 * Conta chaves para achar o fim do bloco, em vez de casar com regex: um objeto
 * aninhado (`details: { ... }`) encerraria a captura cedo demais e o resto do
 * bloco escaparia da conferência.
 */
function blocosDeEscrita(fonte: string): string[] {
  const blocos: string[] = [];
  const abertura = /\.(set|values)\s*\(\s*\{/g;

  let m: RegExpExecArray | null;
  while ((m = abertura.exec(fonte)) !== null) {
    let i = m.index + m[0].length;
    let profundidade = 1;
    const inicio = i;

    while (i < fonte.length && profundidade > 0) {
      const c = fonte[i];
      if (c === "{") profundidade++;
      else if (c === "}") profundidade--;
      i++;
    }

    blocos.push(fonte.slice(inicio, i - 1));
  }

  return blocos;
}

describe("valores gravados em colunas enum", () => {
  const enums = colunasEnum();

  it("o schema realmente expõe colunas enum (o teste não é vazio)", () => {
    // Se `enumValues` deixar de existir numa versão futura do drizzle, a
    // varredura passaria por não encontrar nada — aprovando tudo em silêncio.
    expect(enums.size).toBeGreaterThan(5);
    expect(enums.get("status")?.valores.length).toBeGreaterThan(0);
  });

  it("nenhum arquivo do servidor grava valor fora do enum da coluna", () => {
    const problemas: string[] = [];

    for (const arquivo of arquivosDoServidor()) {
      const fonte = readFileSync(arquivo, "utf8");
      const relativo = path.relative(__dirname, arquivo);

      // SÓ dentro de escrita do drizzle (`.set({...})` / `.values({...})`).
      //
      // A primeira versão varria o arquivo inteiro e acusou 28 falsos
      // positivos: blocos de layout de PDF com `type: "header"`, papéis de
      // assinatura com `role: "CONTRATANTE"`, e chamadas a `logPaymentAudit`
      // cujo `source` é de outra tabela. Nome de propriedade colide entre
      // tabelas e objetos comuns de JavaScript.
      //
      // Um alarme que dispara à toa é pior que nenhum: ensina a ignorá-lo.
      for (const bloco of blocosDeEscrita(fonte)) {
        for (const [prop, { valores }] of enums) {
          // Só atribuições: `prop: "valor"`. Comparações (`===`) ficam de fora
          // — comparar com valor inexistente é outro bug (condição morta).
          const re = new RegExp(`\\b${prop}:\\s*(['"])([^'"]+)\\1`, "g");
          for (const m of bloco.matchAll(re)) {
            const valor = m[2];
            if (!valores.includes(valor)) {
              problemas.push(
                `${relativo}: ${prop}: "${valor}" — aceitos: ${valores.join(", ")}`,
              );
            }
          }
        }
      }
    }

    expect(problemas).toEqual([]);
  });
});
