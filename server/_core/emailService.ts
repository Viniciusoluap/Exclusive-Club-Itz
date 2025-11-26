import nodemailer from 'nodemailer';

/**
 * Serviço de envio de emails via SMTP Titan Email
 * 
 * Configurações:
 * - Servidor: smtp.titan.email
 * - Porta: 587 (TLS) ou 465 (SSL)
 * - Email: atendimento@exclusiveclubitz.com
 */

// Criar transportador SMTP
const transporter = nodemailer.createTransport({
  host: 'smtp.titan.email',
  port: 587,
  secure: false, // true para porta 465, false para outras portas
  auth: {
    user: 'atendimento@exclusiveclubitz.com',
    pass: 'Efficaz2010',
  },
  tls: {
    // Não falhar em certificados inválidos (comum em hospedagens compartilhadas)
    rejectUnauthorized: false,
  },
});

// Verificar conexão SMTP (não bloqueia a inicialização)
transporter.verify((error: any, success: any) => {
  if (error) {
    console.warn('[Email Service] ⚠️ Aviso: Não foi possível verificar conexão SMTP');
    console.warn('[Email Service] Detalhes:', error.message || error);
    console.warn('[Email Service] O sistema continuará funcionando, mas emails podem falhar');
    console.warn('[Email Service] Verifique as credenciais SMTP do Titan Email');
  } else {
    console.log('[Email Service] ✅ Servidor SMTP pronto para enviar emails');
  }
});

/**
 * Interface para envio de email
 */
export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Envia um email via SMTP
 * 
 * @param options Opções de envio (destinatário, assunto, conteúdo)
 * @returns Promise<boolean> true se enviado com sucesso, false caso contrário
 */
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  try {
    const info = await transporter.sendMail({
      from: '"Exclusive Club" <atendimento@exclusiveclubitz.com>',
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text || options.html.replace(/<[^>]*>/g, ''), // Remove HTML tags para versão texto
    });

    console.log('[Email Service] Email enviado com sucesso:', {
      to: options.to,
      subject: options.subject,
      messageId: info.messageId,
    });

    return true;
  } catch (error) {
    console.error('[Email Service] Erro ao enviar email:', {
      to: options.to,
      subject: options.subject,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Envia email de teste para verificar configuração
 * 
 * @param toEmail Email de destino para teste
 * @returns Promise<boolean> true se enviado com sucesso
 */
export async function sendTestEmail(toEmail: string): Promise<boolean> {
  return sendEmail({
    to: toEmail,
    subject: '✅ Teste de Configuração de Email - Exclusive Club',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0891b2;">✅ Email Configurado com Sucesso!</h2>
        <p>Este é um email de teste do sistema de reservas <strong>Exclusive Club</strong>.</p>
        <p>Se você recebeu este email, significa que o servidor SMTP está funcionando corretamente.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
        <p style="color: #6b7280; font-size: 14px;">
          <strong>Configurações:</strong><br>
          Servidor: smtp.titan.email<br>
          Porta: 587 (TLS)<br>
          Remetente: atendimento@exclusiveclubitz.com
        </p>
      </div>
    `,
  });
}
