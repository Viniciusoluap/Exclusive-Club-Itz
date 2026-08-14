/**
 * Conferência de valores fora de faixa (Story 36 / DB-08).
 *
 * O QUE ESTA FATIA FAZ E O QUE NÃO FAZ: ela apenas CONTA quantas linhas hoje
 * violam cada regra. Não trava nada, não corrige nada, não altera nada.
 *
 * POR QUE NESTA ORDEM: o caminho óbvio seria criar `CHECK constraints` no banco.
 * Duas coisas impedem começar por aí.
 *
 * 1. Criar uma trava sobre dados que já a violam FALHA. Sem saber o que existe,
 *    a migração quebraria na subida do servidor — e essa aula já foi dada nesta
 *    auditoria.
 * 2. O banco de produção é TiDB, que aceita `CHECK` mas só o aplica quando
 *    `tidb_enable_check_constraint` está ligado. Uma trava que existe e não
 *    trava é PIOR que trava nenhuma: dá garantia falsa. Enquanto não houver
 *    prova de que o banco realmente recusa o valor, não se declara que ele
 *    recusa.
 *
 * Então primeiro se mede. Com o número na tela, a decisão de travar (e onde)
 * deixa de ser palpite.
 */

import { sql } from "drizzle-orm";

export type TipoDeRegra = "naoNegativo" | "percentual";

export type RegraDeValor = {
  tabela: string;
  coluna: string;
  tipo: TipoDeRegra;
  /** O que a regra significa em português, para a tela. */
  descricao: string;
};

/**
 * As regras.
 *
 * Deliberadamente conservadoras: só o que é indiscutível. "Dinheiro recebido
 * não pode ser negativo" é uma afirmação segura; "cobrança não pode ser zero"
 * não é — pode existir cortesia, ajuste, estorno. Regra discutível vira alarme
 * discutível, e alarme discutível acaba ignorado.
 *
 * O estoque de combustível NÃO entra: ele pode ficar negativo de propósito
 * quando o consumo passa do comprado, e o cálculo de saldo do orçamento depende
 * desse comportamento.
 */
export const REGRAS: RegraDeValor[] = [
  { tabela: "bpo_charges", coluna: "value", tipo: "naoNegativo", descricao: "Valor da cobrança" },
  { tabela: "bpo_charges", coluna: "amount_paid", tipo: "naoNegativo", descricao: "Valor recebido da cobrança" },
  { tabela: "bpo_charges", coluna: "net_value", tipo: "naoNegativo", descricao: "Valor líquido da cobrança" },
  { tabela: "inspection_charges", coluna: "amount", tipo: "naoNegativo", descricao: "Valor da cobrança de vistoria" },
  { tabela: "inspection_charges", coluna: "amount_paid", tipo: "naoNegativo", descricao: "Valor recebido da vistoria" },
  { tabela: "fuel_purchases", coluna: "liters_purchased", tipo: "naoNegativo", descricao: "Litros comprados" },
  { tabela: "fuel_purchases", coluna: "amount_paid", tipo: "naoNegativo", descricao: "Valor pago na compra de combustível" },
  { tabela: "fuel_purchases", coluna: "price_per_liter", tipo: "naoNegativo", descricao: "Preço por litro na compra" },
  { tabela: "fuel_records", coluna: "price_per_liter", tipo: "naoNegativo", descricao: "Preço por litro no abastecimento" },
  { tabela: "fuel_records", coluna: "total_amount", tipo: "naoNegativo", descricao: "Valor total do abastecimento" },
  { tabela: "fuel_budget", coluna: "total_budget", tipo: "naoNegativo", descricao: "Orçamento de combustível" },
  { tabela: "fuel_budget", coluna: "total_spent", tipo: "naoNegativo", descricao: "Gasto de combustível" },
  { tabela: "fuel_budget", coluna: "total_received", tipo: "naoNegativo", descricao: "Recebido de combustível" },
  { tabela: "expense_records", coluna: "amount", tipo: "naoNegativo", descricao: "Valor da despesa" },
  { tabela: "backup_history", coluna: "progress_percent", tipo: "percentual", descricao: "Progresso do backup" },
];

export type ViolacaoDeValor = {
  tabela: string;
  coluna: string;
  descricao: string;
  regra: string;
  linhasForaDaFaixa: number;
};

export type RelatorioDeValores = {
  regrasConferidas: number;
  violacoes: ViolacaoDeValor[];
  /** Nenhuma linha fora de faixa. */
  integro: boolean;
  erro?: string;
};

/** Texto da regra para a tela — o mesmo que vai para o SQL, em português. */
export function textoDaRegra(tipo: TipoDeRegra): string {
  return tipo === "percentual" ? "entre 0 e 100" : "não pode ser negativo";
}

/** Condição SQL que seleciona as linhas QUE VIOLAM a regra. */
export function condicaoDeViolacao(regra: RegraDeValor): string {
  const col = `\`${regra.coluna}\``;
  // NULL nunca é violação: a coluna simplesmente não foi preenchida, e isso é
  // outra discussão (obrigatoriedade), não faixa de valor.
  return regra.tipo === "percentual"
    ? `${col} IS NOT NULL AND (${col} < 0 OR ${col} > 100)`
    : `${col} IS NOT NULL AND ${col} < 0`;
}

/** Normaliza o retorno do driver, que varia entre `[linhas]` e `linhas`. */
function linhasDe(resultado: any): any[] {
  const r = Array.isArray(resultado?.[0]) ? resultado[0] : resultado;
  return Array.isArray(r) ? r : [];
}

/** Só confere regra cuja tabela e coluna existem de fato — o banco tem resíduo. */
async function regrasAplicaveis(db: any): Promise<RegraDeValor[]> {
  const linhas = linhasDe(
    await db.execute(sql`
      SELECT TABLE_NAME AS tabela, COLUMN_NAME AS coluna
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
    `),
  );

  const existentes = new Set(
    linhas.map((l: any) => `${l.tabela ?? l.TABLE_NAME}.${l.coluna ?? l.COLUMN_NAME}`),
  );

  return REGRAS.filter((r) => existentes.has(`${r.tabela}.${r.coluna}`));
}

/**
 * Conta as linhas fora de faixa. Só leitura.
 *
 * Uma consulta só, com `UNION ALL`, em vez de uma por regra: são quinze regras,
 * e quinze idas ao banco a cada abertura da tela de diagnóstico é desperdício
 * sem contrapartida. Nenhum trecho vem de entrada do usuário — tabelas, colunas
 * e condições são todos literais deste arquivo.
 */
export async function conferirValores(db: any): Promise<RelatorioDeValores> {
  if (!db) {
    return { regrasConferidas: 0, violacoes: [], integro: false, erro: "Banco indisponível." };
  }

  try {
    const regras = await regrasAplicaveis(db);
    if (regras.length === 0) {
      return { regrasConferidas: 0, violacoes: [], integro: true };
    }

    const partes = regras.map(
      (r, i) =>
        `SELECT ${i} AS idx, COUNT(*) AS total FROM \`${r.tabela}\` WHERE ${condicaoDeViolacao(r)}`,
    );

    const linhas = linhasDe(await db.execute(sql.raw(partes.join(" UNION ALL "))));

    const violacoes: ViolacaoDeValor[] = [];
    for (const linha of linhas) {
      const idx = Number(linha.idx);
      const total = Number(linha.total ?? 0);
      if (!Number.isFinite(idx) || total <= 0) continue;

      const regra = regras[idx];
      if (!regra) continue;

      violacoes.push({
        tabela: regra.tabela,
        coluna: regra.coluna,
        descricao: regra.descricao,
        regra: textoDaRegra(regra.tipo),
        linhasForaDaFaixa: total,
      });
    }

    return { regrasConferidas: regras.length, violacoes, integro: violacoes.length === 0 };
  } catch (error) {
    const erro = error instanceof Error ? error.message : String(error);
    return { regrasConferidas: 0, violacoes: [], integro: false, erro };
  }
}
