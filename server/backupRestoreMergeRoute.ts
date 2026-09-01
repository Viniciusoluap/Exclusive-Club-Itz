/**
 * Rotas HTTP (fora do tRPC, por causa do upload de arquivo) para a
 * mesclagem seletiva de um backup antigo — ver `backupRestoreMerge.ts` para
 * o porquê disto existir separado do `restoreBackup` bruto.
 *
 * Upload multipart, não JSON via tRPC: o SQL extraído do backup de agosto
 * tem ~3,3 MB — em base64 dentro de um payload tRPC isso vira ~4,4 MB de
 * JSON, e o projeto já usa multer + rota Express dedicada para todo upload
 * de arquivo (ver /api/upload-receipt, /api/upload-client-document em
 * server/_core/index.ts). Este endpoint segue o mesmo padrão.
 */
import { Request, Response } from 'express';
import { sdk } from './_core/sdk';
import { getDb } from './db';
import { extrairSqlDoZip } from './backupVerify';
import { dryRunRestoreMerge, applyRestoreMerge, forceRestoreTablesWithoutNaturalKey } from './backupRestoreMerge';

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user || (user as any).role !== 'admin') {
      res.status(403).json({ error: 'Acesso negado' });
      return false;
    }
    return true;
  } catch {
    res.status(401).json({ error: 'Não autenticado' });
    return false;
  }
}

/** Aceita tanto o `.zip` do backup quanto o `.sql` já extraído. */
function bufferToDumpText(buffer: Buffer, originalName: string): string {
  const isZip = originalName.toLowerCase().endsWith('.zip') || (buffer[0] === 0x50 && buffer[1] === 0x4b);
  if (isZip) return extrairSqlDoZip(buffer);
  return buffer.toString('utf8');
}

async function withUploadedDump(
  req: Request,
  res: Response,
  handler: (dump: string) => Promise<void>,
): Promise<void> {
  const multer = await import('multer');
  const upload = multer.default({
    storage: multer.memoryStorage(),
    limits: { fileSize: 30 * 1024 * 1024 },
  });

  upload.single('file')(req, res, async (err: any) => {
    if (err) {
      res.status(400).json({ error: `Erro ao processar arquivo: ${err.message ?? err}` });
      return;
    }
    const file = (req as any).file;
    if (!file) {
      res.status(400).json({ error: 'Nenhum arquivo enviado' });
      return;
    }
    try {
      const dump = bufferToDumpText(file.buffer, file.originalname ?? '');
      await handler(dump);
    } catch (error: any) {
      console.error('[backup-restore-merge] Erro:', error);
      res.status(400).json({ error: error?.message ?? 'Falha ao processar o backup enviado.' });
    }
  });
}

/** POST /api/backup/restore-merge/dry-run — só lê e compara, não grava nada. */
export async function restoreMergeDryRunRoute(req: Request, res: Response) {
  if (!(await requireAdmin(req, res))) return;
  await withUploadedDump(req, res, async dump => {
    const db = await getDb();
    if (!db) {
      res.status(500).json({ error: 'Banco de dados indisponível' });
      return;
    }
    const relatorio = await dryRunRestoreMerge(db, dump);
    res.json(relatorio);
  });
}

/** POST /api/backup/restore-merge/apply — insere só as linhas novas (nunca atualiza/apaga). */
export async function restoreMergeApplyRoute(req: Request, res: Response) {
  if (!(await requireAdmin(req, res))) return;
  await withUploadedDump(req, res, async dump => {
    const db = await getDb();
    if (!db) {
      res.status(500).json({ error: 'Banco de dados indisponível' });
      return;
    }
    const resultado = await applyRestoreMerge(db, dump);
    res.json(resultado);
  });
}

/**
 * POST /api/backup/restore-merge/force-no-key — insere por id nas tabelas
 * SEM chave natural (vistorias, abastecimentos, reservas, despesas etc.).
 * Só pula ids que já existem; nunca sobrescreve. Risco residual de duplicata
 * por conteúdo (não por id) — ver comentário em `forceRestoreTablesWithoutNaturalKey`.
 */
export async function restoreMergeForceNoKeyRoute(req: Request, res: Response) {
  if (!(await requireAdmin(req, res))) return;
  await withUploadedDump(req, res, async dump => {
    const db = await getDb();
    if (!db) {
      res.status(500).json({ error: 'Banco de dados indisponível' });
      return;
    }
    const resultado = await forceRestoreTablesWithoutNaturalKey(db, dump);
    res.json(resultado);
  });
}
