/**
 * Compara o schema que a aplicação espera com o que o banco realmente tem.
 *
 * POR QUE EXISTE: em 14/08 apareceu no diagnóstico de produção uma migração
 * chamada `0008_equal_pete_wisdom` — nome gerado aleatoriamente pelo
 * drizzle-kit — que NÃO existe no repositório. Ela foi criada no servidor da
 * hospedagem por um `drizzle-kit generate` rodado durante o deploy, e aplicada
 * ao banco de produção sem que ninguém tivesse lido uma linha dela.
 *
 * DDL gerado por diferença pode incluir `DROP COLUMN`. Não havia como responder
 * "o banco perdeu alguma coluna?" sem acesso direto ao banco — e a pergunta
 * ficou aberta, que é exatamente o padrão que esta auditoria vem eliminando.
 *
 * Esta conferência responde. Ela lê o que o código declara em `schema.ts` e o
 * que o `information_schema` mostra, e aponta a diferença nos dois sentidos:
 *
 *   - coluna esperada e AUSENTE  → falha de verdade: o código vai quebrar ao
 *     ler ou gravar nela;
 *   - coluna presente e não declarada → resíduo legado, apenas informativo.
 *     O banco tem objetos de versões antigas do sistema (a view
 *     `financial_charges` é um deles) e isso não atrapalha nada.
 *
 * Não altera nada: só lê.
 */

import { sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/mysql-core";
import * as schema from "../../drizzle/schema";

export type DiferencaDeTabela = {
  tabela: string;
  /** A tabela inteira não existe no banco. */
  ausente: boolean;
  /** Declaradas no código e inexistentes no banco — quebram o sistema. */
  colunasFaltando: string[];
  /** Existem no banco e não são declaradas — resíduo, não é problema. */
  colunasExtras: string[];
};

export type RelatorioDeSchema = {
  tabelasConferidas: number;
  problemas: DiferencaDeTabela[];
  extras: DiferencaDeTabela[];
  /** Nenhuma tabela ausente e nenhuma coluna faltando. */
  integro: boolean;
  erro?: string;
};

/** Nome físico e colunas físicas de cada tabela declarada em `schema.ts`. */
export function tabelasEsperadas(): Map<string, Set<string>> {
  const esperado = new Map<string, Set<string>>();

  for (const valor of Object.values(schema as Record<string, unknown>)) {
    let config: ReturnType<typeof getTableConfig>;
    try {
      config = getTableConfig(valor as never);
    } catch {
      // Não é uma tabela do drizzle (enum, tipo, helper). Segue.
      continue;
    }
    if (!config?.name) continue;
    esperado.set(config.name, new Set(config.columns.map((c) => c.name)));
  }

  return esperado;
}

/** Normaliza o retorno do driver, que varia entre `[linhas]` e `linhas`. */
function linhasDe(resultado: any): any[] {
  const r = Array.isArray(resultado?.[0]) ? resultado[0] : resultado;
  return Array.isArray(r) ? r : [];
}

/** Colunas físicas de cada tabela do banco, numa consulta só. */
export async function colunasDoBanco(db: any): Promise<Map<string, Set<string>>> {
  const linhas = linhasDe(
    await db.execute(sql`
      SELECT TABLE_NAME AS tabela, COLUMN_NAME AS coluna
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
    `),
  );

  const mapa = new Map<string, Set<string>>();
  for (const l of linhas) {
    const t = String(l.tabela ?? l.TABLE_NAME);
    if (!mapa.has(t)) mapa.set(t, new Set());
    mapa.get(t)!.add(String(l.coluna ?? l.COLUMN_NAME));
  }
  return mapa;
}

export function compararSchemas(
  esperado: Map<string, Set<string>>,
  real: Map<string, Set<string>>,
): RelatorioDeSchema {
  const problemas: DiferencaDeTabela[] = [];
  const extras: DiferencaDeTabela[] = [];

  for (const [tabela, colunasEsperadas] of Array.from(esperado.entries()).sort()) {
    const colunasReais = real.get(tabela);

    if (!colunasReais) {
      problemas.push({ tabela, ausente: true, colunasFaltando: [], colunasExtras: [] });
      continue;
    }

    const faltando = Array.from(colunasEsperadas).filter((c) => !colunasReais.has(c)).sort();
    const sobrando = Array.from(colunasReais).filter((c) => !colunasEsperadas.has(c)).sort();

    if (faltando.length > 0) {
      problemas.push({ tabela, ausente: false, colunasFaltando: faltando, colunasExtras: sobrando });
    } else if (sobrando.length > 0) {
      // Coluna a mais não quebra nada: o código simplesmente não a usa.
      // Aparece como informação para explicar diferenças, nunca como alarme.
      extras.push({ tabela, ausente: false, colunasFaltando: [], colunasExtras: sobrando });
    }
  }

  return {
    tabelasConferidas: esperado.size,
    problemas,
    extras,
    integro: problemas.length === 0,
  };
}

export async function conferirSchema(db: any): Promise<RelatorioDeSchema> {
  if (!db) {
    return { tabelasConferidas: 0, problemas: [], extras: [], integro: false, erro: "Banco indisponível." };
  }

  try {
    return compararSchemas(tabelasEsperadas(), await colunasDoBanco(db));
  } catch (error) {
    // Diagnóstico que derruba a tela de diagnóstico não serve para nada.
    const erro = error instanceof Error ? error.message : String(error);
    return { tabelasConferidas: 0, problemas: [], extras: [], integro: false, erro };
  }
}
