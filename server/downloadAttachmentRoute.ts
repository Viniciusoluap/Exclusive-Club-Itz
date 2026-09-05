/**
 * Rota para baixar de volta UM anexo arquivado (foto/documento).
 *
 * POR QUE É ROTA HTTP E NÃO tRPC: o resultado é o binário do arquivo (imagem,
 * PDF), não JSON — mesmo padrão de `downloadBackupRoute.ts`, que já resolve
 * esse problema para o zip do backup.
 *
 * GET /api/backup/attachments/:id/download
 */
import { Request, Response } from 'express';
import { sdk } from './_core/sdk';
import { getDb } from './db';
import { downloadArchivedAttachment } from './backupAttachmentsArchive';

export async function downloadAttachmentRoute(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user || (user as any).role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }
  } catch {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID de anexo inválido' });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: 'Banco de dados indisponível' });
    }

    // Nunca cachear: é um documento pessoal/foto, servido sob autenticação.
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');

    const resultado = await downloadArchivedAttachment(db, id);
    if (!resultado.ok) {
      return res.status(404).json({ error: resultado.error });
    }

    const { fileName, contentType, buffer } = resultado.file;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/"/g, '')}"`);
    res.setHeader('Content-Length', buffer.length.toString());
    return res.end(buffer);
  } catch (error: any) {
    console.error('[download-attachment] Erro:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error?.message ?? 'Erro ao recuperar o anexo arquivado.' });
    }
  }
}
