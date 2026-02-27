import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { getDb } from './db';
import { backupHistory } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

/**
 * Rota para download de arquivos de backup
 * GET /api/backup/download/:id
 */
export async function downloadBackupRoute(req: Request, res: Response) {
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

    // Verifica se o arquivo existe
    if (!backupData.localFilePath || !fs.existsSync(backupData.localFilePath)) {
      return res.status(404).json({ error: 'Arquivo de backup não encontrado no servidor' });
    }

    // Define headers para download
    const fileName = backupData.fileName || path.basename(backupData.localFilePath);
    res.setHeader('Content-Type', 'application/zip');
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
