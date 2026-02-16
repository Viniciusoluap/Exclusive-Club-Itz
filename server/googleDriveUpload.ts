import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const GOOGLE_DRIVE_FOLDER_ID = '1GStmc8RxPQTK_DmDz83x8e_dLUKUALZ1';

/**
 * Faz upload de um arquivo para o Google Drive
 * @param filePath Caminho completo do arquivo local
 * @returns URL do arquivo no Google Drive ou null se falhar
 */
export async function uploadToGoogleDrive(filePath: string): Promise<string | null> {
  try {
    const credentialsPath = path.join(process.cwd(), 'credentials.json');
    const tokenPath = path.join(process.cwd(), 'token.json');

    // Verifica se as credenciais existem
    if (!fs.existsSync(credentialsPath)) {
      console.warn('⚠️  Arquivo credentials.json não encontrado. Upload para Google Drive desabilitado.');
      return null;
    }

    if (!fs.existsSync(tokenPath)) {
      console.warn('⚠️  Arquivo token.json não encontrado. Execute "pnpm setup-drive" primeiro.');
      return null;
    }

    // Carrega credenciais
    const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));

    // Configura autenticação
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    oAuth2Client.setCredentials(token);

    const drive = google.drive({ version: 'v3', auth: oAuth2Client });

    const fileName = path.basename(filePath);

    console.log(`☁️  Fazendo upload para Google Drive: ${fileName}`);

    // Lista arquivos existentes com o mesmo nome na pasta
    const existingFiles = await drive.files.list({
      q: `name='${fileName}' and '${GOOGLE_DRIVE_FOLDER_ID}' in parents and trashed=false`,
      fields: 'files(id, name)',
    });

    // Remove arquivo antigo se existir
    if (existingFiles.data.files && existingFiles.data.files.length > 0) {
      for (const file of existingFiles.data.files) {
        if (file.id) {
          await drive.files.delete({ fileId: file.id });
          console.log(`   Arquivo antigo removido: ${file.name}`);
        }
      }
    }

    // Faz upload do novo arquivo
    const fileMetadata = {
      name: fileName,
      parents: [GOOGLE_DRIVE_FOLDER_ID],
    };

    const media = {
      mimeType: 'application/zip',
      body: fs.createReadStream(filePath),
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink',
    });

    const fileUrl = response.data.webViewLink || `https://drive.google.com/file/d/${response.data.id}/view`;
    
    console.log(`✅ Upload concluído: ${fileUrl}`);
    return fileUrl;

  } catch (error) {
    console.error('❌ Erro ao fazer upload para Google Drive:', error);
    return null;
  }
}
