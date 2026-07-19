import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { getDb } from './db';
import { backupHistory } from '../drizzle/schema';
import { eq } from 'drizzle-orm';
import { sdk } from './_core/sdk';
import { storageGet } from './storage';

/**
 * Rota para download de arquivos de backup
 * GET /api/backup/download/:id
 */
export async function downloadBackupRoute(req: Request, res: Response) {
  // Verificar autenticação e papel admin
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user || (user as any).role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }
  } catch {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  try {
    const backupId = parseInt(req.params.id);
    
    if (isNaN(backupId)) {
      return res.status(400).json({ error: 'ID de backup inválido' });
    }

    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: 'Database not available' });
    }

    // Busca informações do backup
    const backup = await db
      .select()
      .from(backupHistory)
      .where(eq(backupHistory.id, backupId))
      .limit(1);

    if (backup.length === 0) {
      return res.status(404).json({ error: 'Backup não encontrado' });
    }

    const backupData = backup[0];

    // Nunca cachear respostas que expõem/redirecionam para artefatos de backup.
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');

    // Preferencial: gera uma URL de download NOVA e de curta duração (assinada
    // pelo storage proxy) a cada requisição, em vez de reutilizar uma URL
    // persistida que poderia ser previsível/longeva. O gate admin acima já
    // garante que só administradores autenticados chegam aqui.
    if (backupData.fileName) {
      try {
        const { url } = await storageGet(`backups/${backupData.fileName}`);
        if (url) {
          return res.redirect(url);
        }
      } catch (signError) {
        console.warn('Falha ao gerar URL assinada de backup, tentando fallback:', signError);
      }
    }

    // Fallback: URL persistida do storage (backups anteriores a esta correção).
    if (backupData.s3Url) {
      return res.redirect(backupData.s3Url);
    }

    // Fallback: arquivo local (backups antigos antes da migração para o storage)
    if (!backupData.localFilePath || !fs.existsSync(backupData.localFilePath)) {
      return res.status(404).json({ error: 'Arquivo de backup não encontrado. O arquivo pode ter sido removido do servidor.' });
    }

    // Define headers para download
    const fileName = backupData.fileName || path.basename(backupData.localFilePath);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', backupData.fileSizeBytes?.toString() || '0');

    // Envia o arquivo
    const fileStream = fs.createReadStream(backupData.localFilePath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      console.error('Erro ao enviar arquivo:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Erro ao enviar arquivo' });
      }
    });

  } catch (error) {
    console.error('Erro no download de backup:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}
