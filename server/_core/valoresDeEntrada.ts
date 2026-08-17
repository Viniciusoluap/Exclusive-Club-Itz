/**
 * Faixas de valor barradas na ENTRADA (Story 36 / DB-08, 2ª fatia).
 *
 * A 1ª fatia (`regrasDeValor.ts`) mediu: hoje o banco tem **zero** linhas fora
 * de faixa. Esta fatia fecha a porta para que continue assim.
 *
 * POR QUE NA ENTRADA E NÃO EM `CHECK` NO BANCO: o banco de produção é TiDB, que
 * aceita `CHECK` mas só o aplica quando `tidb_enable_check_constraint` está
 * ligado — e uma trava que existe e não trava é PIOR que trava nenhuma, porque
 * dá garantia falsa. Enquanto não houver prova de que o banco recusa o valor,
 * não se declara que ele recusa. A própria story previa este caminho: "onde
 * indisponível, validação aplicacional equivalente".
 *
 * O que isto cobre: toda escrita que passa pela API — que são todas, desde que
 * a Story 37 colocou porteira nos scripts avulsos contra produção.
 *
 * SOBRE A UNIDADE: neste sistema o dinheiro aparece ora em reais (`decimal`),
 * ora em centavos (`int`). Estes guardas são sobre o **sinal**, não sobre a
 * unidade, então valem para os dois sem conversão.
 */

import { z } from "zod";

/**
 * Valor que pode ser zero, mas nunca negativo.
 *
 * Para o que é saldo, acumulado ou total: zero é um estado legítimo (nada
 * recebido ainda), negativo não é.
 */
export const naoNegativo = (oQue: string) =>
  z.number().nonnegative({ message: `${oQue} não pode ser negativo` });

/**
 * Valor que precisa ser maior que zero.
 *
 * Para o que é uma movimentação: registrar um pagamento de R$ 0,00 não é
 * pagamento, é ruído — e um pagamento negativo **subtrai** do que já foi pago,
 * corrompendo o saldo sem deixar rastro de erro.
 */
export const positivo = (oQue: string) =>
  z.number().positive({ message: `${oQue} precisa ser maior que zero` });

/** Percentual de 0 a 100. */
export const percentual = (oQue: string) =>
  z
    .number()
    .min(0, { message: `${oQue} não pode ser negativo` })
    .max(100, { message: `${oQue} não pode passar de 100` });
