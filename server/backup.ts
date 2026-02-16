import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import archiver from 'archiver';
import { getDb } from './db';
import { backupHistory } from '../drizzle/schema';
import { sendBackupFailureNotification, sendBackupSuccessNotification } from './backupNotification';
import { eq } from 'drizzle-orm';

const execAsync = promisify(exec);

// ID da pasta do Google Drive onde os backups serão salvos
const DRIVE_FOLDER_ID = '1GStmc8RxPQTK_DmDz83x8e_dLUKUALZ1';

// Caminho para as credenciais OAuth2
const CREDENTIALS_PATH = path.join(process.cwd(), 'google-drive-credentials.json');
const TOKEN_PATH = path.join(process.cwd(), 'google-drive-token.json');

/**
 * Carrega as credenciais salvas ou solicita nova autenticação
 */
async function authorize() {
  let credentials;
  
  try {
    const content = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
    credentials = JSON.parse(content);
  } catch (error) {
    console.error('❌ Arquivo de credenciais não encontrado.');
    console.error('Por favor, configure as credenciais do Google Drive primeiro.');
    process.exit(1);
  }

  const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // Verifica se já existe um token salvo
  try {
    const token = fs.readFileSync(TOKEN_PATH, 'utf-8');
    oAuth2Client.setCredentials(JSON.parse(token));
    return oAuth2Client;
  } catch (error) {
    // Token não existe, precisa autenticar
    return getNewToken(oAuth2Client);
  }
}

/**
 * Obtém novo token de autenticação
 */
async function getNewToken(oAuth2Client: any) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file'],
  });

  console.log('🔐 Autorize este app visitando esta URL:', authUrl);
  console.log('\n⚠️  Este processo requer interação manual.');
  console.log('Após autorizar, cole o código aqui e pressione Enter.');
  
  // Em produção, isso seria feito via interface web
  // Por enquanto, retornamos erro para configuração manual
  throw new Error('Autenticação manual necessária. Execute o script de setup primeiro.');
}

/**
 * Exporta o banco de dados para arquivo SQL
 */
async function exportDatabase(): Promise<string> {
  const timestamp = new Date().toISOString().split('T')[0];
  const backupDir = path.join(process.cwd(), 'temp-backup');
  const dbBackupPath = path.join(backupDir, `database-${timestamp}.sql`);

  // Cria diretório temporário se não existir
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  console.log('📦 Exportando banco de dados...');

  // Extrai informações da DATABASE_URL
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL não configurada');
  }

  // Parse da URL do banco (formato: mysql://user:pass@host:port/database)
  const urlMatch = dbUrl.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (!urlMatch) {
    throw new Error('Formato de DATABASE_URL inválido');
  }

  const [, user, password, host, port, database] = urlMatch;

  // Executa mysqldump
  const dumpCommand = `mysqldump -h ${host} -P ${port} -u ${user} -p'${password}' ${database} > ${dbBackupPath}`;
  
  try {
    await execAsync(dumpCommand);
    console.log('✅ Banco de dados exportado com sucesso');
    return dbBackupPath;
  } catch (error) {
    console.error('❌ Erro ao exportar banco de dados:', error);
    throw error;
  }
}

/**
 * Cria arquivo ZIP com backup completo
 */
async function createBackupZip(dbBackupPath: string): Promise<string> {
  const timestamp = new Date().toISOString().split('T')[0];
  const zipPath = path.join(process.cwd(), `exclusive-club-backup-${timestamp}.zip`);

  console.log('📦 Criando arquivo ZIP...');

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`✅ Backup criado: ${archive.pointer()} bytes`);
      resolve(zipPath);
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
        'temp-backup/**',
        '.git/**',
        'dist/**',
        '*.zip',
        'google-drive-*.json',
        '*.log'
      ]
    });

    archive.finalize();
  });
}

/**
 * Faz upload do backup para Google Drive
 */
async function uploadToDrive(auth: any, filePath: string): Promise<{ fileId: string; fileUrl: string }> {
  const drive = google.drive({ version: 'v3', auth });
  const fileName = path.basename(filePath);

  console.log('☁️  Fazendo upload para Google Drive...');

  // Verifica se já existe backup anterior na pasta
  try {
    const response = await drive.files.list({
      q: `'${DRIVE_FOLDER_ID}' in parents and name contains 'exclusive-club-backup-' and trashed=false`,
      fields: 'files(id, name)',
    });

    // Deleta backups anteriores
    if (response.data.files && response.data.files.length > 0) {
      console.log(`🗑️  Removendo ${response.data.files.length} backup(s) anterior(es)...`);
      for (const file of response.data.files) {
        await drive.files.delete({ fileId: file.id! });
        console.log(`   Removido: ${file.name}`);
      }
    }
  } catch (error) {
    console.warn('⚠️  Não foi possível verificar backups anteriores:', error);
  }

  // Faz upload do novo backup
  const fileMetadata = {
    name: fileName,
    parents: [DRIVE_FOLDER_ID],
  };

  const media = {
    mimeType: 'application/zip',
    body: fs.createReadStream(filePath),
  };

  try {
    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink',
    });

    console.log('✅ Upload concluído!');
    console.log(`   Nome: ${file.data.name}`);
    console.log(`   ID: ${file.data.id}`);
    console.log(`   Link: ${file.data.webViewLink}`);
    
    return {
      fileId: file.data.id!,
      fileUrl: file.data.webViewLink!,
    };
  } catch (error) {
    console.error('❌ Erro ao fazer upload:', error);
    throw error;
  }
  
  throw new Error('Falha ao fazer upload: nenhum arquivo retornado');
}

/**
 * Limpa arquivos temporários
 */
function cleanup(dbBackupPath: string, zipPath: string): void {
  console.log('🧹 Limpando arquivos temporários...');
  
  try {
    // Remove arquivo SQL
    if (fs.existsSync(dbBackupPath)) {
      fs.unlinkSync(dbBackupPath);
    }

    // Remove diretório temporário
    const backupDir = path.dirname(dbBackupPath);
    if (fs.existsSync(backupDir)) {
      fs.rmdirSync(backupDir, { recursive: true });
    }

    // Remove arquivo ZIP local
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }

    console.log('✅ Limpeza concluída');
  } catch (error) {
    console.warn('⚠️  Erro ao limpar arquivos temporários:', error);
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
  let zipPath = '';
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

    // 1. Autentica com Google Drive
    const auth = await authorize();

    // 2. Exporta banco de dados
    dbBackupPath = await exportDatabase();

    // 3. Cria arquivo ZIP
    zipPath = await createBackupZip(dbBackupPath);

    // Obtém tamanho do arquivo
    const fileStats = fs.statSync(zipPath);
    const fileSizeBytes = fileStats.size;
    const fileName = path.basename(zipPath);

    // 4. Faz upload para Google Drive
    const { fileId, fileUrl } = await uploadToDrive(auth, zipPath);

    // 5. Limpa arquivos temporários
    cleanup(dbBackupPath, zipPath);

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
          driveFileId: fileId,
          driveFileUrl: fileUrl,
        })
        .where(eq(backupHistory.id, backupId));
      console.log(`✅ Backup atualizado no banco`);
    }

    console.log('');
    console.log('✅ Backup concluído com sucesso!');

    // Envia notificação de sucesso (opcional, pode comentar se não quiser)
    // await sendBackupSuccessNotification(fileName, fileSizeBytes, durationSeconds, fileUrl);
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
    
    // Tenta limpar arquivos mesmo em caso de erro
    if (dbBackupPath || zipPath) {
      cleanup(dbBackupPath, zipPath);
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
