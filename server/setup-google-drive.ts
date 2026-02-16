import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const TOKEN_PATH = path.join(process.cwd(), 'google-drive-token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'google-drive-credentials.json');

/**
 * Script de configuração inicial do Google Drive
 * Este script deve ser executado UMA VEZ para autenticar o sistema
 */
async function setupGoogleDrive() {
  console.log('🔐 Configuração do Google Drive - Backup Automático');
  console.log('='.repeat(60));
  console.log('');

  // Verifica se o arquivo de credenciais existe
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.error('❌ Arquivo de credenciais não encontrado!');
    console.error('');
    console.error('📋 Siga estas etapas:');
    console.error('');
    console.error('1. Acesse: https://console.cloud.google.com/');
    console.error('2. Crie um novo projeto ou selecione um existente');
    console.error('3. Ative a API do Google Drive');
    console.error('4. Vá em "Credenciais" > "Criar credenciais" > "ID do cliente OAuth"');
    console.error('5. Escolha "Aplicativo para computador"');
    console.error('6. Baixe o arquivo JSON de credenciais');
    console.error('7. Renomeie para "google-drive-credentials.json"');
    console.error('8. Coloque na raiz do projeto: /home/ubuntu/exclusive-club-reservas/');
    console.error('');
    console.error('Depois execute este script novamente.');
    process.exit(1);
  }

  console.log('✅ Arquivo de credenciais encontrado');
  console.log('');

  try {
    console.log('🌐 Abrindo navegador para autenticação...');
    console.log('');
    console.log('⚠️  IMPORTANTE:');
    console.log('   - Uma janela do navegador será aberta');
    console.log('   - Faça login com sua conta Google');
    console.log('   - Autorize o acesso ao Google Drive');
    console.log('   - Após autorizar, volte para este terminal');
    console.log('');

    const auth = await authenticate({
      scopes: SCOPES,
      keyfilePath: CREDENTIALS_PATH,
    });

    // Salva o token para uso futuro
    const credentials = auth.credentials;
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(credentials, null, 2));

    console.log('');
    console.log('✅ Autenticação concluída com sucesso!');
    console.log(`📄 Token salvo em: ${TOKEN_PATH}`);
    console.log('');

    // Testa a conexão listando arquivos da pasta
    console.log('🧪 Testando conexão com Google Drive...');
    const drive = google.drive({ version: 'v3', auth: auth as any });
    
    const folderId = '1GStmc8RxPQTK_DmDz83x8e_dLUKUALZ1';
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name)',
      pageSize: 5,
    });

    console.log('✅ Conexão estabelecida!');
    console.log(`📁 Pasta de destino acessível (${response.data.files?.length || 0} arquivos encontrados)`);
    console.log('');
    console.log('='.repeat(60));
    console.log('✅ Configuração concluída!');
    console.log('');
    console.log('Agora você pode executar backups com:');
    console.log('  pnpm backup');
    console.log('');
    console.log('Os backups serão salvos automaticamente na pasta do Google Drive.');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('');
    console.error('❌ Erro durante a autenticação:', error);
    console.error('');
    console.error('Verifique se:');
    console.error('  - As credenciais estão corretas');
    console.error('  - A API do Google Drive está ativada');
    console.error('  - Você tem permissão de acesso à pasta do Drive');
    process.exit(1);
  }
}

// Executa o setup
setupGoogleDrive()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
