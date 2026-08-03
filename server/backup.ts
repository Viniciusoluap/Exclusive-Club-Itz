import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import archiver from 'archiver';
import { getDb } from './db';
import { backupHistory } from '../drizzle/schema';
import { sendBackupFailureNotification } from './backupNotification';
import { exportDatabaseToSQL } from './databaseBackup';
import { eq } from 'drizzle-orm';
import { storagePut } from './storage';
import { collectAttachments, downloadAttachments, buildManifest } from './backupFiles';


const execAsync = promisify(exec);

// Diretório onde os backups serão salvos
const BACKUP_DIR = '/home/ubuntu/backups';

// Garante que o diretório de backups existe.
// Envolto em try/catch para que a simples importação deste módulo (ex.: em testes
// unitários) não derrube o processo em ambientes onde o caminho não é gravável.
try {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
} catch (error) {
  console.warn(`⚠️  Não foi possível criar o diretório de backups (${BACKUP_DIR}):`, error);
}

// Algoritmo de criptografia at-rest do artefato de backup (autenticado).
const BACKUP_ENCRYPTION_ALGO = 'aes-256-gcm';
// Marcador do container criptografado (8 bytes): "ECBK" + versão 1.
const BACKUP_ENC_MAGIC = Buffer.from('ECBK\x01\x00\x00\x00', 'latin1');

/**
 * Lê e valida a chave de criptografia de backup do ambiente.
 *
 * SEGURANÇA: se a chave não estiver configurada, o backup DEVE falhar
 * explicitamente — nunca gerar/enviar um artefato sem criptografia.
 */
export function getBackupEncryptionKey(): Buffer {
  const raw = process.env.BACKUP_ENCRYPTION_KEY;

  if (!raw || raw.trim().length === 0) {
    throw new Error(
      'BACKUP_ENCRYPTION_KEY não configurada. Backup ABORTADO para evitar a geração de ' +
        'artefato sem criptografia. Defina BACKUP_ENCRYPTION_KEY (>= 32 caracteres) no ambiente ' +
        '(ver .env.example) antes de executar o backup.'
    );
  }

  if (raw.trim().length < 32) {
    throw new Error(
      'BACKUP_ENCRYPTION_KEY muito curta. Use pelo menos 32 caracteres de entropia ' +
        '(ex.: `openssl rand -base64 48`).'
    );
  }

  return Buffer.from(raw, 'utf8');
}

/**
 * Criptografa um buffer com AES-256-GCM.
 *
 * Formato do container: MAGIC(8) | SALT(16) | IV(12) | AUTH_TAG(16) | CIPHERTEXT.
 * A chave de 32 bytes é derivada por arquivo via scrypt(keyMaterial, salt), de modo
 * que o mesmo segredo do ambiente produz artefatos com chaves distintas.
 */
export function encryptBackupBuffer(plaintext: Buffer, keyMaterial: Buffer): Buffer {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(keyMaterial, salt, 32);

  const cipher = crypto.createCipheriv(BACKUP_ENCRYPTION_ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([BACKUP_ENC_MAGIC, salt, iv, authTag, ciphertext]);
}

/**
 * Descriptografa um container gerado por {@link encryptBackupBuffer}.
 * Usado por rotinas de restore/validação. Lança se o auth tag não conferir
 * (proteção de integridade/adulteração do GCM).
 */
export function decryptBackupBuffer(container: Buffer, keyMaterial: Buffer): Buffer {
  const magic = container.subarray(0, BACKUP_ENC_MAGIC.length);
  if (!magic.equals(BACKUP_ENC_MAGIC)) {
    throw new Error('Container de backup criptografado inválido (magic inesperado).');
  }

  let offset = BACKUP_ENC_MAGIC.length;
  const salt = container.subarray(offset, (offset += 16));
  const iv = container.subarray(offset, (offset += 12));
  const authTag = container.subarray(offset, (offset += 16));
  const ciphertext = container.subarray(offset);

  const key = crypto.scryptSync(keyMaterial, salt, 32);
  const decipher = crypto.createDecipheriv(BACKUP_ENCRYPTION_ALGO, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Exporta banco de dados usando Node.js puro (sem mysqldump)
 */
async function exportDatabase(): Promise<string> {
  // Nome único por execução: com o caminho fixo 'database.sql', dois backups
  // simultâneos escreviam no MESMO arquivo e um apagava o do outro no meio do
  // processo.
  const dbBackupPath = path.join(
    BACKUP_DIR,
    `database-${Date.now()}-${process.pid}.sql`,
  );
  
  console.log('💾 Exportando banco de dados...');
  
  try {
    await exportDatabaseToSQL(dbBackupPath);
    return dbBackupPath;
  } catch (error) {
    console.error('❌ Erro ao exportar banco de dados:', error);
    throw error;
  }
}
/**
 * Padrões de arquivos que NUNCA devem entrar em um backup, mesmo que apareçam
 * dentro de um diretório de uploads. Defesa em profundidade contra vazamento de
 * segredos/credenciais (o backup só deve conter dado de negócio legítimo).
 */
const BACKUP_SECRET_IGNORE = [
  '**/.env',
  '**/.env.*',
  '**/*.key',
  '**/*.pem',
  '**/*.p12',
  '**/*.pfx',
  '**/google-drive-*.json',
  '**/credentials.json',
  '**/token.json',
  '**/*credential*.json',
  '**/*token*.json',
];

/**
 * Cria o arquivo ZIP de backup.
 *
 * SEGURANÇA (SYS-22): o backup contém APENAS dados de negócio — o dump do banco
 * de dados e, quando existir localmente, o diretório de uploads de usuário.
 * O código-fonte do servidor, `.env`, tokens OAuth e demais segredos NÃO são
 * empacotados (antes, `archive.glob('**\/*', { cwd: process.cwd() })` empacotava
 * o repositório inteiro, incluindo `.env` e `google-drive-token.json`).
 */
async function createBackupZip(
  dbBackupPath: string,
  attachments: Awaited<ReturnType<typeof downloadAttachments>> | null,
): Promise<{ zipPath: string; fileSizeBytes: number }> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const zipPath = path.join(BACKUP_DIR, `exclusive-club-backup-${timestamp}.zip`);

  console.log('📦 Criando arquivo ZIP (somente dados de negócio)...');

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    output.on('close', () => {
      if (settled) return;
      settled = true;
      const fileSizeBytes = archive.pointer();
      console.log(`✅ Backup criado: ${fileSizeBytes} bytes`);
      resolve({ zipPath, fileSizeBytes });
    });

    // CAUSA RAIZ dos backups eternamente "Em Execução": o erro do WriteStream
    // não era tratado. Se a escrita do zip falhasse (diretório inexistente,
    // sem permissão, disco cheio), esta Promise NUNCA se resolvia — nem
    // sucesso, nem falha. O registro ficava 'running' para sempre e a tela
    // exibia um backup que jamais terminaria.
    output.on('error', fail);
    archive.on('error', fail);

    archive.pipe(output);

    // 1. Dump do banco de dados (dado de negócio principal).
    archive.file(dbBackupPath, { name: path.basename(dbBackupPath) });

    // 2. Uploads de usuário, se existirem localmente. NÃO inclui código-fonte,
    //    `.env`, tokens OAuth nem qualquer credencial (ver BACKUP_SECRET_IGNORE).
    // 2. Anexos baixados do storage externo (fotos de abastecimento e vistoria,
    //    documentos e contratos de clientes, comprovantes, documentos de
    //    embarcações). Sem isso o backup guardaria só URLs — links quebrados
    //    caso o storage se perca.
    if (attachments) {
      for (const file of attachments.files) {
        archive.append(file.buffer, { name: `uploads/${file.category}/${file.name}` });
      }
      // Manifesto: registra explicitamente o que NÃO entrou, para o backup nunca
      // dar a impressão de estar completo quando não está.
      archive.append(buildManifest(attachments.report), { name: 'uploads/MANIFESTO.txt' });
      console.log(`📎 Anexos incluídos: ${attachments.report.downloaded}/${attachments.report.total}`);
    }

    const uploadsDir = process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads');
    if (fs.existsSync(uploadsDir) && fs.statSync(uploadsDir).isDirectory()) {
      console.log(`📁 Incluindo uploads de usuário: ${uploadsDir}`);
      archive.glob(
        '**/*',
        {
          cwd: uploadsDir,
          dot: false,
          ignore: BACKUP_SECRET_IGNORE,
        },
        { prefix: 'uploads' }
      );
    } else {
      console.log('ℹ️  Nenhum diretório local de uploads encontrado — backup conterá apenas o dump do banco.');
    }

    archive.finalize();
  });
}

/**
 * Limpa backups antigos (mantém últimos 7 dias)
 */
async function cleanupOldBackups(): Promise<void> {
  console.log('🧹 Limpando backups antigos...');
  
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    const now = Date.now();
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    
    let removedCount = 0;
    
    for (const file of files) {
      if (file.startsWith('exclusive-club-backup-') && file.endsWith('.zip')) {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = fs.statSync(filePath);
        const fileAge = now - stats.mtimeMs;
        
        if (fileAge > sevenDaysInMs) {
          fs.unlinkSync(filePath);
          removedCount++;
          console.log(`   Removido: ${file}`);
        }
      }
    }
    
    if (removedCount > 0) {
      console.log(`✅ ${removedCount} backup(s) antigo(s) removido(s)`);
    } else {
      console.log('✅ Nenhum backup antigo para remover');
    }
  } catch (error) {
    console.warn('⚠️  Erro ao limpar backups antigos:', error);
  }
}

/**
 * Remove arquivo SQL temporário
 */
function cleanupTempFiles(dbBackupPath: string): void {
  try {
    if (fs.existsSync(dbBackupPath)) {
      fs.unlinkSync(dbBackupPath);
      console.log('✅ Arquivo temporário removido');
    }
  } catch (error) {
    console.warn('⚠️  Erro ao remover arquivo temporário:', error);
  }
}

/**
 * Executa o backup completo
 */
/**
 * Trava contra execuções simultâneas.
 *
 * O histórico mostrava pares de backups iniciados no MESMO segundo — dois
 * cliques, ou duas requisições concorrentes. Duas execuções ao mesmo tempo
 * duplicam o dump completo do banco e o download de todos os anexos, competem
 * por disco e se atropelam nos arquivos temporários. Uma por vez.
 */
let backupInProgress = false;

export class BackupAlreadyRunningError extends Error {
  constructor() {
    super('Já existe um backup em andamento. Aguarde a conclusão antes de iniciar outro.');
    this.name = 'BackupAlreadyRunningError';
  }
}

export async function runBackup(): Promise<void> {
  const startTime = new Date();
  console.log('🚀 Iniciando backup automático...');
  console.log(`📅 Data: ${startTime.toLocaleString('pt-BR')}`);
  console.log('');

  if (backupInProgress) {
    console.warn('⚠️  Backup já em andamento — ignorando nova solicitação.');
    throw new BackupAlreadyRunningError();
  }
  backupInProgress = true;

  let dbBackupPath = '';
  let backupId: number | null = null;
  const db = await getDb();

  try {
    // 0. Valida a chave de criptografia ANTES de qualquer coisa. Se ausente,
    //    aborta o backup imediatamente (não dumpa PII para o disco nem gera
    //    artefato sem criptografia).
    const encryptionKey = getBackupEncryptionKey();

    // Registra início do backup no banco
    if (db) {
      const result = await db.insert(backupHistory).values({
        startedAt: startTime.toISOString(),
        status: 'running',
      });
      backupId = result[0].insertId;
      console.log(`💾 Backup registrado no banco (ID: ${backupId})`);
    }

    // 1. Exporta banco de dados
    dbBackupPath = await exportDatabase();

    // 2. Baixa os anexos referenciados no banco (fotos, contratos, documentos).
    //    Falha de um arquivo não derruba o backup: fica registrada no manifesto.
    let attachments: Awaited<ReturnType<typeof downloadAttachments>> | null = null;
    if (db) {
      try {
        console.log('📎 Coletando anexos referenciados no banco...');
        const items = await collectAttachments(db);
        console.log(`📎 ${items.length} anexo(s) encontrado(s). Baixando...`);
        attachments = await downloadAttachments(items);
      } catch (attachErr) {
        console.error('[Backup] Falha ao coletar anexos:', attachErr);
      }
    }

    // 3. Cria arquivo ZIP (dados de negócio + anexos)
    const { zipPath } = await createBackupZip(dbBackupPath, attachments);

    // 3. Remove arquivo SQL temporário
    cleanupTempFiles(dbBackupPath);

    // 4. Criptografa o artefato (AES-256-GCM) ANTES do upload ao storage externo.
    console.log('🔐 Criptografando artefato de backup...');
    const plainZipBuffer = fs.readFileSync(zipPath);
    const encryptedBuffer = encryptBackupBuffer(plainZipBuffer, encryptionKey);
    const fileName = `${path.basename(zipPath)}.enc`;
    const fileSizeBytes = encryptedBuffer.length;

    // 5. Upload do artefato criptografado para o storage (proxy Forge/S3).
    console.log('☁️  Fazendo upload do backup criptografado...');
    const s3Key = `backups/${fileName}`;
    const { url: s3Url } = await storagePut(s3Key, encryptedBuffer, 'application/octet-stream');
    console.log(`✅ Upload concluído: ${s3Url}`);

    // 6. Remove arquivo local (zip em claro) após upload
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
      console.log('✅ Arquivo local removido (mantido apenas criptografado no storage)');
    }

    // 7. Limpa backups antigos
    await cleanupOldBackups();

    // Calcula duração
    const endTime = new Date();
    const durationSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

    // Atualiza registro no banco com sucesso
    if (db && backupId) {
      await db.update(backupHistory)
        .set({
          completedAt: endTime.toISOString(),
          status: 'success',
          fileName,
          fileSizeBytes,
          durationSeconds,
          s3Url, // Salva URL do S3
          localFilePath: null, // Arquivo local foi removido
        })
        .where(eq(backupHistory.id, backupId));
      console.log(`✅ Backup atualizado no banco`);
    }

    console.log('');
    console.log('✅ Backup concluído com sucesso!');
    console.log(`📁 Arquivo salvo em: ${zipPath}`);
  } catch (error) {
    console.error('');
    console.error('❌ Erro durante o backup:', error);
    
    const endTime = new Date();
    const durationSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

    // Registra falha no banco
    if (db && backupId) {
      await db.update(backupHistory)
        .set({
          completedAt: endTime.toISOString(),
          status: 'failed',
          durationSeconds,
          errorMessage: error instanceof Error ? error.message : String(error),
        })
        .where(eq(backupHistory.id, backupId));
      console.log(`❌ Falha registrada no banco`);
    }

    // Envia notificação de falha
    if (error instanceof Error) {
      await sendBackupFailureNotification(error, startTime);
    }
    
    // Tenta limpar arquivo temporário mesmo em caso de erro
    if (dbBackupPath) {
      cleanupTempFiles(dbBackupPath);
    }
    
    throw error;
  } finally {
    backupInProgress = false;
  }
}

// Permite executar diretamente via CLI
// Em ES modules, verificamos se o script está sendo executado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  runBackup()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
