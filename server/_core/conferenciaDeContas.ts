/**
 * Conferência de contas: o total gravado bate com as partes? (Story 33 / DB-19)
 *
 * POR QUE ISTO EXISTE, E POR QUE NÃO É UMA MIGRAÇÃO.
 *
 * A Story 33 propunha unificar a representação de dinheiro: hoje o sistema
 * guarda valor ora em `decimal` (reais), ora em `int` (centavos). A proposta
 * era converter tudo para um formato só.
 *
 * Converter mexe em dados de dinheiro que já existem — risco real e imediato —
 * para comprar um benefício que ninguém sabe se existe: o responsável pelo
 * projeto nunca viu, na prática, um erro de centavo em relatório. Gastar risco
 * certo por benefício incerto é mau negócio.
 *
 * Então em vez de converter, se CONFERE. É o mesmo movimento que salvou o
 * backup nesta auditoria: todo indicador dizia que estava bom, e só comparar o
 * arquivo com o banco revelou que nenhum restaurava. Indicador não prova nada;
 * comparar prova.
 *
 * O QUE ESTA CONFERÊNCIA FAZ: recalcula o total de cada abastecimento a partir
 * das partes e compara com o total gravado. Só leitura — não altera nada.
 *
 * POR QUE JUSTAMENTE O ABASTECIMENTO: é o único lugar onde uma conta composta
 * é feita em centavos inteiros (litros × preço, ambos multiplicados por 100).
 * As outras tabelas de dinheiro guardam valor numa representação só, sem conta
 * entre elas — não há o que reconciliar ali. Se uma conversão de unidade se
 * perder, é aqui que aparece, e aparece grande: erro de fator 100, não de
 * centavo.
 */

import { sql } from "drizzle-orm";

/**
 * Folga aceita entre o total gravado e o recalculado, em centavos.
 *
 * NÃO é tolerância a erro de conta: é a taxa fixa de serviço, que entra no
 * total e não vem das partes. Deixar a folga generosa de propósito — o alvo
 * aqui é erro de UNIDADE (fator 100), que estoura qualquer folga razoável.
 * Uma folga apertada transformaria mudança de taxa em alarme falso, e alarme
 * falso acaba ignorado.
 */
const FOLGA_CENTAVOS = 100_000; // R$ 1.000,00

export type ContaDivergente = {
  id: number;
  litros: number;
  precoPorLitro: number;
  totalGravado: number;
  totalRecalculado: number;
  diferenca: number;
};

export type RelatorioDeContas = {
  registrosConferidos: number;
  divergentes: ContaDivergente[];
  /** Todo total gravado bate com as partes. */
  integro: boolean;
  erro?: string;
};

/** Normaliza o retorno do driver, que varia entre `[linhas]` e `linhas`. */
function linhasDe(resultado: any): any[] {
  const r = Array.isArray(resultado?.[0]) ? resultado[0] : resultado;
  return Array.isArray(r) ? r : [];
}

/**
 * Confere se o total de cada abastecimento bate com litros × preço.
 *
 * `liters` e `price_per_liter` são inteiros em centésimos, então o produto sai
 * multiplicado por 10.000 e precisa ser dividido por 100 para virar centavos —
 * é exatamente esta divisão que uma conversão perdida erraria.
 */
export async function conferirContas(db: any): Promise<RelatorioDeContas> {
  if (!db) {
    return { registrosConferidos: 0, divergentes: [], integro: false, erro: "Banco indisponível." };
  }

  try {
    const linhas = linhasDe(
      await db.execute(sql`
        SELECT
          id,
          liters,
          price_per_liter,
          total_amount,
          ROUND(liters * price_per_liter / 100) AS recalculado
        FROM fuel_records
        WHERE liters IS NOT NULL
          AND price_per_liter IS NOT NULL
          AND total_amount IS NOT NULL
      `),
    );

    const divergentes: ContaDivergente[] = [];
    for (const l of linhas) {
      const totalGravado = Number(l.total_amount);
      const recalculado = Number(l.recalculado);
      if (!Number.isFinite(totalGravado) || !Number.isFinite(recalculado)) continue;

      const diferenca = totalGravado - recalculado;
      // Diferença negativa é sempre suspeita: o total não pode ser menor que o
      // combustível que o compõe. Acima da folga, é erro de unidade.
      if (diferenca < 0 || diferenca > FOLGA_CENTAVOS) {
        divergentes.push({
          id: Number(l.id),
          litros: Number(l.liters),
          precoPorLitro: Number(l.price_per_liter),
          totalGravado,
          totalRecalculado: recalculado,
          diferenca,
        });
      }
    }

    return {
      registrosConferidos: linhas.length,
      divergentes,
      integro: divergentes.length === 0,
    };
  } catch (error) {
    const erro = error instanceof Error ? error.message : String(error);
    return { registrosConferidos: 0, divergentes: [], integro: false, erro };
  }
}
