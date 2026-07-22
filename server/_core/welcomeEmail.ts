import { sendEmail } from "./emailService";
import { escapeHtml } from "./htmlEscape";

export interface WelcomeEmailData {
  clientName: string;
  clientEmail: string;
  quotaName: string;
}

/**
 * Envia email de boas-vindas para novo cliente cadastrado
 */
export async function sendWelcomeEmail(data: WelcomeEmailData): Promise<boolean> {
  const subject = "Bem-vindo ao Exclusive Club";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f9fafb;">
      <div style="background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%); padding: 40px 20px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Exclusive Club</h1>
        <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">Bem-vindo(a) ao nosso clube!</p>
      </div>
      
      <div style="background-color: white; padding: 40px 30px; border-radius: 8px; margin: 20px;">
        <h2 style="color: #0891b2; margin-top: 0;">Cadastro Realizado com Sucesso</h2>
        
        <p style="font-size: 16px; color: #374151;">Prezado(a) <strong>${escapeHtml(data.clientName)}</strong>,</p>
        
        <p style="font-size: 16px; color: #374151; line-height: 1.6;">
          É com satisfação que confirmamos seu cadastro no <strong>Exclusive Club</strong>. 
          Você agora tem acesso ao nosso sistema de compartilhamento de embarcações.
        </p>
        
        <div style="background-color: #f0f9ff; border-left: 4px solid #0891b2; padding: 20px; margin: 25px 0; border-radius: 4px;">
          <p style="margin: 8px 0; color: #1f2937;"><strong>🎫 Sua Cota:</strong> ${escapeHtml(data.quotaName)}</p>
        </div>
        
        <h3 style="color: #0891b2; font-size: 18px; margin-top: 30px;">Como Funciona o Sistema</h3>
        
        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 25px 0; border-radius: 4px;">
          <p style="margin: 0 0 15px 0; color: #1f2937; font-size: 15px;"><strong>📋 Regras de Uso:</strong></p>
          <ul style="margin: 0; padding-left: 20px; color: #1f2937; font-size: 15px; line-height: 1.8;">
            <li><strong>Limite de reservas:</strong> Máximo de 2 reservas ativas por vez</li>
            <li><strong>Segundas-feiras:</strong> Não disponíveis para reservas (manutenção semanal)</li>
            <li><strong>Antecedência:</strong> Chegue com 15 minutos de antecedência</li>
            <li><strong>Cancelamento:</strong> Cancele com antecedência caso não possa comparecer</li>
          </ul>
        </div>
        
        <h3 style="color: #0891b2; font-size: 18px; margin-top: 30px;">Como Fazer uma Reserva</h3>
        
        <ol style="color: #374151; font-size: 15px; line-height: 1.8; padding-left: 20px;">
          <li>Acesse o sistema através do link fornecido</li>
          <li>Navegue até a página "Minhas Reservas"</li>
          <li>Selecione a embarcação desejada</li>
          <li>Escolha uma data disponível no calendário</li>
          <li>Confirme sua reserva</li>
        </ol>
        
        <div style="background-color: #f0fdf4; border-left: 4px solid #059669; padding: 20px; margin: 25px 0; border-radius: 4px;">
          <p style="margin: 0; color: #1f2937; font-size: 15px;">
            <strong>💡 Dica:</strong> Você receberá um lembrete por email 24 horas antes de cada reserva confirmada.
          </p>
        </div>
        
        <p style="font-size: 16px; color: #374151; line-height: 1.6; margin-top: 30px;">
          Estamos à disposição para esclarecer quaisquer dúvidas. Aproveite ao máximo nosso clube!
        </p>
        
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        
        <p style="font-size: 14px; color: #6b7280; text-align: center;">
          Atenciosamente,<br>
          <strong>Equipe Exclusive Club</strong>
        </p>
      </div>
    </div>
  `;

  console.log(`[Email] Enviando boas-vindas para ${data.clientEmail}`);
  
  // Skip sending emails in test environment to avoid bounce limits
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    console.log('[Email] Skipped in test environment');
    return true;
  }
  
  return await sendEmail({
    to: data.clientEmail,
    subject,
    html,
  });
}
