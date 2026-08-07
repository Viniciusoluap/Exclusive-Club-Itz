import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { getDb } from './db';
import { backupHistory } from '../drizzle/schema';
import { eq } from 'drizzle-orm';
import { sdk } from './_core/sdk';
import { storageGet } from './storage';
import { assertSafeExternalUrl } from './_core/urlSafety';
import { decryptBackupBuffer, getBackupEncryptionKey, isEncryptedBackup } from './backup';

/**
 * Nome do arquivo entregue ao navegador.
 *
 * O artefato é guardado como `.zip.enc` porque no armazenamento ele ESTÁ
 * criptografado. Mas o que sai daqui já foi descriptografado, então continuar
 * chamando de `.enc` seria mentir para o outro lado: o usuário recebia um
 * arquivo que nenhum programa abria e não tinha como saber por quê.
 *
 * Trocar só a extensão, sem descriptografar, seria pior ainda — um `.zip` que
 * não é um zip. A extensão passa a ser `.zip` porque o CONTEÚDO passou a ser
 * um zip de verdade.
 */
export function nomeParaDownload(fileName: string): string {
  return fileName.replace(/\.enc$/i, '');
}

/** Baixa os bytes do artefato a partir de uma URL do armazenamento. */
async function baixarDoArmazenamento(url: string): Promise<Buffer> {
  // A URL do fallback vem do banco, então passa pelo guard de SSRF.
  assertSafeExternalUrl(url);
  const resposta = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
  return Buffer.from(resposta.data);
}

/**
 * Entrega o artefato pronto para uso: descriptografado, como zip.
 *
 * Backups anteriores à criptografia são servidos como estão — a checagem do
 * marcador do container distingue os dois casos.
 */
function enviarComoZip(res: Response, bruto: Buffer, fileName: string) {
  let conteudo = bruto;

  if (isEncryptedBackup(bruto)) {
    try {
      conteudo = decryptBackupBuffer(bruto, getBackupEncryptionKey());
    } catch (error: any) {
      // Um erro aqui quase sempre significa BACKUP_ENCRYPTION_KEY diferente da
      // que gerou o artefato. Dizer isso explicitamente evita a conclusão
      // errada de que o backup está corrompido.
      console.error('[download] Falha ao descriptografar backup:', error?.message ?? error);
      return res.status(500).json({
        error:
          'Não foi possível descriptografar este backup. Isso ocorre quando a BACKUP_ENCRYPTION_KEY ' +
          'atual é diferente da que gerou o arquivo. O arquivo em si não está corrompido.',
      });
    }
  }

  const nome = nomeParaDownload(fileName);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
  res.setHeader('Content-Length', conteudo.length.toString());
  return res.end(conteudo);
}

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
    //
    // O arquivo é buscado pelo SERVIDOR e descriptografado antes de seguir para
    // o navegador. Antes havia um redirect para o armazenamento, que entregava
    // o `.zip.enc` cru — um arquivo cifrado que nenhum programa abre.
    if (backupData.fileName) {
      try {
        const { url } = await storageGet(`backups/${backupData.fileName}`);
        if (url) {
          const bruto = await baixarDoArmazenamento(url);
          return enviarComoZip(res, bruto, backupData.fileName);
        }
      } catch (signError) {
        console.warn('Falha ao obter backup do storage, tentando fallback:', signError);
      }
    }

    // Fallback: URL persistida do storage (backups anteriores a esta correção).
    if (backupData.s3Url) {
      const bruto = await baixarDoArmazenamento(backupData.s3Url);
      return enviarComoZip(res, bruto, backupData.fileName ?? 'backup.zip');
    }

    // Fallback: arquivo local (backups antigos antes da migração para o storage)
    if (!backupData.localFilePath || !fs.existsSync(backupData.localFilePath)) {
      return res.status(404).json({ error: 'Arquivo de backup não encontrado. O arquivo pode ter sido removido do servidor.' });
    }

    const fileName = backupData.fileName || path.basename(backupData.localFilePath);
    return enviarComoZip(res, fs.readFileSync(backupData.localFilePath), fileName);

  } catch (error) {
    console.error('Erro no download de backup:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}
