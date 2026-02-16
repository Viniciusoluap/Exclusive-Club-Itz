import { sendEmail } from './_core/emailService';
import { ENV } from './_core/env';

/**
 * Envia notificação de falha de backup para o administrador
 */
export async function sendBackupFailureNotification(error: Error, startTime: Date): Promise<void> {
  const endTime = new Date();
  const durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 1000 / 60);

  const subject = '🚨 FALHA NO BACKUP AUTOMÁTICO - Exclusive Club';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background-color: #dc2626;
          color: white;
          padding: 20px;
          border-radius: 8px 8px 0 0;
          text-align: center;
        }
        .content {
          background-color: #f9fafb;
          padding: 30px;
          border: 1px solid #e5e7eb;
          border-top: none;
          border-radius: 0 0 8px 8px;
        }
        .alert-box {
          background-color: #fee2e2;
          border-left: 4px solid #dc2626;
          padding: 15px;
          margin: 20px 0;
        }
        .info-table {
          width: 100%;
          margin: 20px 0;
          border-collapse: collapse;
        }
        .info-table td {
          padding: 10px;
          border-bottom: 1px solid #e5e7eb;
        }
        .info-table td:first-child {
          font-weight: bold;
          width: 40%;
          color: #6b7280;
        }
        .error-details {
          background-color: #1f2937;
          color: #f3f4f6;
          padding: 15px;
          border-radius: 6px;
          font-family: 'Courier New', monospace;
          font-size: 13px;
          overflow-x: auto;
          margin: 15px 0;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          color: #6b7280;
          font-size: 14px;
        }
        .action-required {
          background-color: #fef3c7;
          border: 2px solid #f59e0b;
          padding: 15px;
          border-radius: 6px;
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">🚨 FALHA NO BACKUP AUTOMÁTICO</h1>
        </div>
        
        <div class="content">
          <div class="alert-box">
            <strong>⚠️ ATENÇÃO:</strong> O backup automático do sistema Exclusive Club falhou durante a execução.
            Seus dados podem estar em risco se o problema não for resolvido.
          </div>

          <h2 style="color: #dc2626;">Detalhes da Falha</h2>
          
          <table class="info-table">
            <tr>
              <td>Data/Hora do Início:</td>
              <td>${startTime.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
            </tr>
            <tr>
              <td>Data/Hora da Falha:</td>
              <td>${endTime.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
            </tr>
            <tr>
              <td>Duração até Falha:</td>
              <td>${durationMinutes} minuto(s)</td>
            </tr>
            <tr>
              <td>Tipo de Erro:</td>
              <td>${error.name || 'Error'}</td>
            </tr>
          </table>

          <h3 style="color: #dc2626;">Mensagem de Erro:</h3>
          <div class="error-details">
            ${error.message}
          </div>

          ${error.stack ? `
            <h3 style="color: #6b7280;">Stack Trace:</h3>
            <div class="error-details">
              ${error.stack.replace(/\n/g, '<br>')}
            </div>
          ` : ''}

          <div class="action-required">
            <h3 style="margin-top: 0; color: #92400e;">⚡ Ação Necessária</h3>
            <p style="margin-bottom: 0;">
              1. Verifique os logs do servidor para mais detalhes<br>
              2. Confirme que as credenciais do Google Drive estão válidas<br>
              3. Verifique a conexão com o banco de dados<br>
              4. Execute um backup manual: <code>pnpm backup</code><br>
              5. Se o problema persistir, contate o suporte técnico
            </p>
          </div>

          <div class="footer">
            <p>
              Este é um email automático do sistema de backup.<br>
              <strong>Exclusive Club - Sistema de Gestão Náutica</strong><br>
              ${new Date().toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await sendEmail({
      to: process.env.OWNER_NAME || 'admin@exclusiveclub.com', // Email do proprietário
      subject,
      html,
    });
    console.log('✅ Notificação de falha enviada com sucesso');
  } catch (emailError) {
    console.error('❌ Erro ao enviar notificação de falha:', emailError);
    // Não lançamos erro aqui para não interromper o processo principal
  }
}

/**
 * Envia notificação de sucesso de backup (opcional)
 */
export async function sendBackupSuccessNotification(
  fileName: string,
  fileSizeBytes: number,
  durationSeconds: number,
  driveFileUrl?: string
): Promise<void> {
  const fileSizeMB = (fileSizeBytes / 1024 / 1024).toFixed(2);
  const durationMinutes = Math.round(durationSeconds / 60);

  const subject = '✅ Backup Automático Concluído - Exclusive Club';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background-color: #059669;
          color: white;
          padding: 20px;
          border-radius: 8px 8px 0 0;
          text-align: center;
        }
        .content {
          background-color: #f9fafb;
          padding: 30px;
          border: 1px solid #e5e7eb;
          border-top: none;
          border-radius: 0 0 8px 8px;
        }
        .success-box {
          background-color: #d1fae5;
          border-left: 4px solid #059669;
          padding: 15px;
          margin: 20px 0;
        }
        .info-table {
          width: 100%;
          margin: 20px 0;
          border-collapse: collapse;
        }
        .info-table td {
          padding: 10px;
          border-bottom: 1px solid #e5e7eb;
        }
        .info-table td:first-child {
          font-weight: bold;
          width: 40%;
          color: #6b7280;
        }
        .button {
          display: inline-block;
          padding: 12px 24px;
          background-color: #059669;
          color: white;
          text-decoration: none;
          border-radius: 6px;
          margin: 20px 0;
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          color: #6b7280;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">✅ Backup Concluído com Sucesso</h1>
        </div>
        
        <div class="content">
          <div class="success-box">
            <strong>✓ Sucesso:</strong> O backup automático do sistema Exclusive Club foi concluído com sucesso.
            Seus dados estão seguros no Google Drive.
          </div>

          <h2 style="color: #059669;">Detalhes do Backup</h2>
          
          <table class="info-table">
            <tr>
              <td>Data/Hora:</td>
              <td>${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
            </tr>
            <tr>
              <td>Nome do Arquivo:</td>
              <td>${fileName}</td>
            </tr>
            <tr>
              <td>Tamanho:</td>
              <td>${fileSizeMB} MB</td>
            </tr>
            <tr>
              <td>Duração:</td>
              <td>${durationMinutes} minuto(s)</td>
            </tr>
          </table>

          ${driveFileUrl ? `
            <div style="text-align: center;">
              <a href="${driveFileUrl}" class="button">📁 Acessar Backup no Google Drive</a>
            </div>
          ` : ''}

          <div class="footer">
            <p>
              Este é um email automático do sistema de backup.<br>
              <strong>Exclusive Club - Sistema de Gestão Náutica</strong><br>
              ${new Date().toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    await sendEmail({
      to: process.env.OWNER_NAME || 'admin@exclusiveclub.com',
      subject,
      html,
    });
    console.log('✅ Notificação de sucesso enviada');
  } catch (emailError) {
    console.warn('⚠️  Erro ao enviar notificação de sucesso:', emailError);
  }
}
