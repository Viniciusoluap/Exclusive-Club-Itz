/**
 * O backup é de agosto; o schema mudou desde então.
 *
 * POR QUE ESTE TESTE EXISTE: em produção (05/09/2026), com a causa real já
 * visível, os dois erros que sobraram eram exatamente isto —
 *   - `bpo_charges`: "Unknown column 'ignored' in 'field list'" (coluna que o
 *     banco não tem mais);
 *   - `users`: "Data too long for column 'role'" (valor fora do enum atual).
 * E, como `fuel_purchases.purchased_by` tem FK para `users`, a falha de
 * `users` derrubava junto a recuperação das compras de combustível — o que por
 * sua vez deixava o controle de abastecimento com estoque negativo.
 *
 * Uma linha inteira não pode ser perdida por causa de uma coluna que saiu do
 * schema nem de um valor de enum aposentado.
 */
import { describe, expect, it } from 'vitest';
import { adaptToCurrentSchema, type ColumnInfoForTests } from './backupRestoreMerge';

const schema = new Map<string, ColumnInfoForTests>([
  ['id', { type: 'int', enumValues: null, nullable: false, defaultValue: null }],
  ['email', { type: 'varchar(255)', enumValues: null, nullable: true, defaultValue: null }],
  ['role', { type: "enum('user','admin','employee')", enumValues: ['user', 'admin', 'employee'], nullable: false, defaultValue: 'user' }],
]);

describe('adaptToCurrentSchema', () => {
  it('descarta coluna que não existe mais, preservando o resto da linha', () => {
    const r = adaptToCurrentSchema(
      ['id', 'email', 'ignored', 'role'],
      [['1', "'a@x.com'", "'sim'", "'user'"]],
      schema,
    );

    expect(r.columns).toEqual(['id', 'email', 'role']);
    expect(r.rows).toEqual([['1', "'a@x.com'", "'user'"]]);
    expect(r.adjustments.join(' ')).toContain('ignored');
  });

  it('troca valor de enum aposentado pelo DEFAULT da coluna, sem inventar valor', () => {
    const r = adaptToCurrentSchema(
      ['id', 'role'],
      [['1', "'cliente'"]],
      schema,
    );

    // 'user' é o DEFAULT declarado pelo próprio banco — não um chute.
    expect(r.rows).toEqual([['1', "'user'"]]);
    expect(r.adjustments.join(' ')).toContain('cliente');
  });

  it('não mexe em valor de enum que continua válido', () => {
    const r = adaptToCurrentSchema(['id', 'role'], [['1', "'admin'"]], schema);
    expect(r.rows).toEqual([['1', "'admin'"]]);
    expect(r.adjustments).toEqual([]);
  });

  it('preserva NULL em coluna de enum', () => {
    const r = adaptToCurrentSchema(['id', 'role'], [['1', 'NULL']], schema);
    expect(r.rows).toEqual([['1', 'NULL']]);
  });

  it('não relata ajuste quando nada precisou mudar', () => {
    const r = adaptToCurrentSchema(['id', 'email'], [['1', "'a@x.com'"]], schema);
    expect(r.adjustments).toEqual([]);
    expect(r.columns).toEqual(['id', 'email']);
  });

  it('agrupa a contagem por valor ajustado, em vez de uma linha de relato por registro', () => {
    const r = adaptToCurrentSchema(
      ['id', 'role'],
      [['1', "'cliente'"], ['2', "'cliente'"], ['3', "'user'"]],
      schema,
    );
    expect(r.adjustments).toHaveLength(1);
    expect(r.adjustments[0]).toContain('2 linha(s)');
  });
});
