import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import archiver from 'archiver';
import { getDb } from './db';
import { backupHistory } from '../drizzle/schema';
import { sendBackupFailureNotification } from './backupNotification';
import { exportDatabaseToSQL } from './databaseBackup';
import { storagePut } from './storage';
import { eq } from 'drizzle-orm';


const execAsync = promisify(exec);

// Diretório onde os backups serão salvos
const BACKUP_DIR = '/home/ubuntu/backups';

// Garante que o diretório de backups existe
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Exporta banco de dados usando Node.js puro (sem mysqldump)
 */
async function exportDatabase(): Promise<string> {
  const dbBackupPath = path.join(BACKUP_DIR, 'database.sql');
  
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
 * Cria arquivo ZIP com backup completo
 */
async function createBackupZip(dbBackupPath: string): Promise<{ zipPath: string; fileSizeBytes: number }> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const zipPath = path.join(BACKUP_DIR, `exclusive-club-backup-${timestamp}.zip`);

  console.log('📦 Criando arquivo ZIP...');

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      const fileSizeBytes = archive.pointer();
      console.log(`✅ Backup criado: ${fileSizeBytes} bytes`);
      resolve({ zipPath, fileSizeBytes });
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    // Adiciona banco de dados
    archive.file(dbBackupPath, { name: path.basename(dbBackupPath) });

    // Adiciona código-fonte (excluindo node_modules e arquivos temporários)
    archive.glob('**/*', {
      cwd: process.cwd(),
      ignore: [
        'node_modules/**',
        '.git/**',
        'dist/**',
        '*.zip',
        '*.log',
        'backups/**'
      ]
    });

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
export async function runBackup(): Promise<void> {
  const startTime = new Date();
  console.log('🚀 Iniciando backup automático...');
  console.log(`📅 Data: ${startTime.toLocaleString('pt-BR')}`);
  console.log('');

  let dbBackupPath = '';
  let backupId: number | null = null;
  const db = await getDb();

  try {
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

    // 2. Cria arquivo ZIP
    const { zipPath, fileSizeBytes } = await createBackupZip(dbBackupPath);
    const fileName = path.basename(zipPath);

    // 3. Remove arquivo SQL temporário
    cleanupTempFiles(dbBackupPath);

    // 4. Upload para S3
    console.log('☁️  Fazendo upload para S3...');
    const s3Key = `backups/${path.basename(zipPath)}`;
    const zipBuffer = fs.readFileSync(zipPath);
    const { url: s3Url } = await storagePut(s3Key, zipBuffer, 'application/zip');
    console.log(`✅ Upload concluído: ${s3Url}`);

    // 5. Limpa arquivo local (economizar espaço)
    fs.unlinkSync(zipPath);
    console.log(`🗑️  Arquivo local removido: ${zipPath}`);

    // 6. Limpa backups antigos
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
          fileName: path.basename(zipPath),
          fileSizeBytes,
          durationSeconds,
          localFilePath: null, // Arquivo local foi removido
          s3Url, // URL permanente no S3
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
