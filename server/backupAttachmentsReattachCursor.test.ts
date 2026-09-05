/**
 * A recolocação precisa AVANÇAR a cada chamada.
 *
 * POR QUE ESTE TESTE EXISTE: sem ponto de retomada, cada chamada recomeçava do
 * primeiro anexo. Os já examinados e saudáveis continuam referenciados, então
 * eram re-examinados sempre, o orçamento de tempo se esgotava no mesmo prefixo
 * e o processo nunca chegava ao fim — em produção (05/09/2026) a tela ficou
 * mais de seis minutos em "0 recolocado(s), faltam 164" e terminou em
 * "Load failed".
 *
 * O teste fixa o contrato do cursor: uma chamada com `afterId` não pode
 * devolver um `lastId` menor, senão o laço da tela gira em falso para sempre.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const storagePut = vi.fn();
const storageGet = vi.fn();

vi.mock('./storage', () => ({
  storagePut: (...args: any[]) => storagePut(...args),
  storageGet: (...args: any[]) => storageGet(...args),
}));
vi.mock('./backup', () => ({
  getBackupEncryptionKey: () => Buffer.alloc(32),
  decryptBackupBuffer: (b: Buffer) => b,
  isEncryptedBackup: () => false,
}));
vi.mock('./_core/urlSafety', () => ({ assertSafeExternalUrl: () => {} }));

const { reattachAttachmentsBatch } = await import('./backupAttachmentsReattach');

/** Desmonta o template do drizzle em texto e parâmetros. */
function lerStatement(statement: any): { texto: string; params: unknown[] } {
  const chunks: any[] = statement?.queryChunks ?? [];
  let texto = '';
  const params: unknown[] = [];
  for (const chunk of chunks) {
    if (Array.isArray(chunk?.value)) texto += chunk.value.join('');
    else params.push(chunk);
  }
  return { texto: texto || String(statement ?? ''), params };
}

/** Banco de mentira: três anexos arquivados, nenhum referenciado por registro. */
function bancoFalso(ids: number[]) {
  return {
    execute: async (statement: any) => {
      const { texto, params } = lerStatement(statement);

      if (texto.includes('COUNT(*) AS total FROM backup_attachments')) {
        return [[{ total: ids.length }]];
      }
      if (texto.includes('FROM backup_attachments')) {
        // Respeita o `id > ?` do cursor: é exatamente o que está sob teste.
        const depoisDe = Number(params.find(p => typeof p === 'number') ?? 0);
        return [
          ids
            .filter(id => id > depoisDe)
            .map(id => ({
              id,
              category: 'clientes',
              file_name: `arquivo-${id}.jpg`,
              source_url: `https://cdn.exemplo/${id}.jpg`,
              storage_url: null,
            })),
        ];
      }
      // Nenhum registro referencia estas URLs → cada anexo é só "contabilizado".
      return [[{ total: 0 }]];
    },
  };
}

beforeEach(() => {
  storagePut.mockReset();
  storageGet.mockReset();
});

describe('reattachAttachmentsBatch — ponto de retomada', () => {
  it('devolve o maior id examinado, para a próxima chamada continuar dali', async () => {
    const progresso = await reattachAttachmentsBatch(bancoFalso([10, 20, 30]) as any, 0, 60000);

    expect(progresso.lastId).toBe(30);
    expect(progresso.done).toBe(true);
    expect(progresso.notReferencedNow).toBe(3);
  });

  it('respeita o cursor: começar depois de um id não reexamina os anteriores', async () => {
    const progresso = await reattachAttachmentsBatch(bancoFalso([10, 20, 30]) as any, 20, 60000);

    // Só o 30 sobrou — os anteriores não podem ser processados de novo.
    expect(progresso.processedNow).toBe(1);
    expect(progresso.lastId).toBe(30);
  });

  it('nunca recua o cursor, mesmo quando não há nada a processar', async () => {
    const progresso = await reattachAttachmentsBatch(bancoFalso([10, 20, 30]) as any, 30, 60000);

    expect(progresso.processedNow).toBe(0);
    // Recuar aqui faria a tela reprocessar o acervo inteiro em laço infinito.
    expect(progresso.lastId).toBe(30);
    expect(progresso.done).toBe(true);
  });
});
