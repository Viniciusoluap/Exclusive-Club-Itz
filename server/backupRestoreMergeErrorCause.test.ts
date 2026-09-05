/**
 * A tela precisa mostrar POR QUE um INSERT falhou, não só o SQL tentado.
 *
 * POR QUE ESTE TESTE EXISTE: o driver mysql2/drizzle relata falha de INSERT
 * com `error.message = "Failed query: INSERT INTO ... params: [...]"` — o
 * comando tentado, não o motivo da recusa. O motivo real (ex.: `ER_DUP_ENTRY:
 * Duplicate entry 'x' for key 'users_email_uq'`) fica em `error.cause`, e até
 * 05/09/2026 o código descartava essa informação: em produção, `users`,
 * `bpo_charges` e `fuel_purchases` "falharam" sem nenhuma pista visível do
 * motivo real, só o SQL inteiro repetido na tela.
 *
 * Não depende de banco — `describeError` é uma função pura sobre o objeto de
 * erro.
 */
import { describe, expect, it } from 'vitest';
import { describeError } from './backupRestoreMerge';

describe('describeError', () => {
  it('devolve a mensagem quando não há causa aninhada', () => {
    expect(describeError(new Error('Failed query: INSERT INTO users ...'))).toBe(
      'Failed query: INSERT INTO users ...',
    );
  });

  it('inclui a causa real, não só o SQL tentado', () => {
    const causaReal = new Error("ER_DUP_ENTRY: Duplicate entry 'a@mail.com' for key 'users_email_uq'");
    const erroDoDriver = new Error('Failed query: INSERT INTO users ...', { cause: causaReal });

    const descricao = describeError(erroDoDriver);

    expect(descricao).toContain('Failed query: INSERT INTO users ...');
    expect(descricao).toContain('users_email_uq');
  });

  it('segue a cadeia de causas até o fim, sem entrar em loop', () => {
    const raiz = new Error('ER_NO_REFERENCED_ROW: referenced row not found');
    const meio = new Error('Failed query: INSERT INTO fuel_purchases ...', { cause: raiz });
    const topo = new Error('Erro ao aplicar tabela', { cause: meio });

    const descricao = describeError(topo);

    expect(descricao).toContain('Erro ao aplicar tabela');
    expect(descricao).toContain('Failed query: INSERT INTO fuel_purchases ...');
    expect(descricao).toContain('referenced row not found');
  });

  it('não trava quando o erro não é um Error de verdade', () => {
    expect(describeError('string qualquer')).toBe('string qualquer');
    expect(describeError(null)).toBe('null');
  });
});
