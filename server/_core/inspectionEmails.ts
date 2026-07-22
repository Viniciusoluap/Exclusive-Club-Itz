import { sendEmail } from "./emailService";
import { ENV } from "./env";
import { escapeHtml } from "./htmlEscape";

interface FailedItem {
  name: string;
  status: string;
  photoUrl?: string;
}

interface InspectionData {
  id: number;
  vesselName: string;
  vesselType: string;
  clientName: string;
  clientEmail: string;
  inspectionDate: string;
  failedItems: FailedItem[];
  pdfUrl?: string;
}

/**
 * Envia emails automáticos quando uma vistoria é reprovada
 * @param inspection Dados da vistoria reprovada
 * @returns true se emails foram enviados com sucesso
 */
export async function sendInspectionFailureEmails(inspection: InspectionData): Promise<boolean> {
  try {
    // Email para o ADMIN
    const adminEmailSent = await sendAdminEmail(inspection);
    
    // Email para o CLIENTE
    const clientEmailSent = await sendClientEmail(inspection);
    
    return adminEmailSent && clientEmailSent;
  } catch (error) {
    console.error("[InspectionEmails] Erro ao enviar emails:", error);
    return false;
  }
}

/**
 * Envia email para o admin informando sobre vistoria reprovada
 */
async function sendAdminEmail(inspection: InspectionData): Promise<boolean> {
  const subject = `🔴 Vistoria Reprovada - ${inspection.vesselName} - ${inspection.clientName}`;
  
  const failedItemsList = inspection.failedItems
    .map((item, index) => `${index + 1}. **${item.name}**: ${item.status}`)
    .join("\n");
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">⚠️ Vistoria Reprovada</h1>
      </div>
      
      <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          Uma vistoria foi reprovada e requer atenção imediata para orçamento e cobrança.
        </p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #dc2626;">
          <h2 style="color: #111827; font-size: 18px; margin-top: 0;">Informações da Vistoria</h2>
          <p style="margin: 8px 0;"><strong>Data:</strong> ${inspection.inspectionDate}</p>
          <p style="margin: 8px 0;"><strong>Cliente:</strong> ${escapeHtml(inspection.clientName)}</p>
          <p style="margin: 8px 0;"><strong>Email:</strong> ${escapeHtml(inspection.clientEmail)}</p>
          <p style="margin: 8px 0;"><strong>Embarcação:</strong> ${escapeHtml(inspection.vesselName)} (${escapeHtml(inspection.vesselType)})</p>
        </div>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="color: #dc2626; font-size: 16px; margin-top: 0;">Itens Reprovados:</h3>
          <div style="color: #374151; line-height: 1.8;">
            ${failedItemsList.split("\n").map(item => `<p style="margin: 5px 0;">${item}</p>`).join("")}
          </div>
        </div>
        
        <div style="background: #fef3c7; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b; margin-bottom: 20px;">
          <p style="margin: 0; color: #92400e; font-size: 14px;">
            <strong>⚡ Próximos Passos:</strong><br>
            1. Realizar orçamento dos reparos necessários<br>
            2. Cadastrar cobrança no sistema após aprovação do cliente<br>
            3. Sistema gerará PIX automaticamente via Asaas
          </p>
        </div>
        
        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
          O relatório completo da vistoria está anexo a este email.
        </p>
      </div>
    </div>
  `;
  
  // TODO: Implementar download do PDF e conversão para Buffer
  const attachments: Array<{filename: string; content: Buffer; contentType: string}> = [];
  
  return await sendEmail({
    to: process.env.OWNER_NAME || 'atendimento@exclusiveclubitz.com',
    subject,
    html,
    attachments,
  });
}

/**
 * Envia email educativo para o cliente sobre vistoria reprovada
 */
async function sendClientEmail(inspection: InspectionData): Promise<boolean> {
  const subject = `⚠️ Vistoria Reprovada - ${inspection.vesselName} - Ação Necessária`;
  
  const failedItemsList = inspection.failedItems
    .map((item, index) => `${index + 1}. **${item.name}**: ${item.status}`)
    .join("\n");
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">⚠️ Vistoria Reprovada</h1>
        <p style="margin: 10px 0 0 0; opacity: 0.9;">Identificamos danos que precisam de atenção</p>
      </div>
      
      <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          Olá <strong>${escapeHtml(inspection.clientName)}</strong>,
        </p>

        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          Durante a vistoria da embarcação <strong>${escapeHtml(inspection.vesselName)}</strong> realizada em <strong>${inspection.inspectionDate}</strong>,
          identificamos alguns itens que não passaram na inspeção e necessitam de reparo.
        </p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #f59e0b;">
          <h3 style="color: #d97706; font-size: 16px; margin-top: 0;">Itens Reprovados:</h3>
          <div style="color: #374151; line-height: 1.8;">
            ${failedItemsList.split("\n").map(item => `<p style="margin: 5px 0;">${item}</p>`).join("")}
          </div>
        </div>
        
        <div style="background: #dbeafe; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #3b82f6;">
          <h3 style="color: #1e40af; font-size: 16px; margin-top: 0;">📋 Próximos Passos:</h3>
          <ol style="color: #374151; margin: 10px 0; padding-left: 20px; line-height: 1.8;">
            <li>Nossa equipe entrará em contato com um orçamento detalhado dos reparos</li>
            <li>Após sua aprovação, você receberá um link de pagamento via PIX</li>
            <li>Os reparos serão realizados assim que o pagamento for confirmado</li>
          </ol>
        </div>
        
        <div style="background: #d1fae5; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #10b981;">
          <h3 style="color: #065f46; font-size: 16px; margin-top: 0;">💡 Dicas para Evitar Danos Futuros:</h3>
          <ul style="color: #374151; margin: 10px 0; padding-left: 20px; line-height: 1.8;">
            <li><strong>Inspeção pré-uso:</strong> Sempre verifique a embarcação antes de sair</li>
            <li><strong>Velocidade adequada:</strong> Respeite os limites e condições do mar</li>
            <li><strong>Ancoragem correta:</strong> Use pontos apropriados e evite áreas rochosas</li>
            <li><strong>Limpeza regular:</strong> Lave a embarcação após cada uso</li>
            <li><strong>Cuidado com objetos:</strong> Evite arrastar ou bater em superfícies duras</li>
            <li><strong>Atenção ao clima:</strong> Não navegue em condições adversas</li>
          </ul>
        </div>
        
        <div style="background: #fef3c7; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b; margin-bottom: 20px;">
          <p style="margin: 0; color: #92400e; font-size: 14px;">
            <strong>⚡ Importante:</strong> A manutenção preventiva é sempre mais econômica que reparos emergenciais. 
            Cuidar bem da embarcação garante sua segurança e economia a longo prazo.
          </p>
        </div>
        
        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
          O relatório completo da vistoria está anexo a este email para sua referência.
        </p>
        
        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
          Em caso de dúvidas, estamos à disposição!
        </p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            Exclusive Club Itz<br>
            ${process.env.OWNER_NAME || 'atendimento@exclusiveclubitz.com'}
          </p>
        </div>
      </div>
    </div>
  `;
  
  // TODO: Implementar download do PDF e conversão para Buffer
  const attachments: Array<{filename: string; content: Buffer; contentType: string}> = [];
  
  return await sendEmail({
    to: inspection.clientEmail,
    subject,
    html,
    attachments,
  });
}

/**
 * Notifica cliente sobre novo reparo registrado
 */
export async function notifyClientNewRepair(data: {
  clientEmail: string;
  clientName: string;
  vesselName: string;
  description: string;
  individualAmount: number;
  dueDate: string;
}): Promise<boolean> {
  const subject = `🔧 Novo Reparo Registrado - ${data.vesselName}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">🔧 Novo Reparo Registrado</h1>
      </div>
      
      <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          Olá <strong>${escapeHtml(data.clientName)}</strong>,
        </p>
        
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          Um novo reparo foi registrado na embarcação <strong>${escapeHtml(data.vesselName)}</strong>.
        </p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #3b82f6;">
          <h3 style="color: #1d4ed8; font-size: 16px; margin-top: 0;">Detalhes do Reparo:</h3>
          <p style="margin: 8px 0;"><strong>Descrição:</strong> ${escapeHtml(data.description)}</p>
          <p style="margin: 8px 0;"><strong>Valor Individual:</strong> R$ ${data.individualAmount.toFixed(2)}</p>
          <p style="margin: 8px 0;"><strong>Vencimento:</strong> ${new Date(data.dueDate).toLocaleDateString('pt-BR')}</p>
        </div>
        
        <div style="background: #dbeafe; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="color: #1e40af; font-size: 16px; margin-top: 0;">💳 Como Pagar:</h3>
          <ol style="color: #374151; margin: 10px 0; padding-left: 20px; line-height: 1.8;">
            <li>Acesse a página de <strong>Pagamento de Danos</strong> no sistema</li>
            <li>Selecione o reparo que deseja pagar</li>
            <li>Escolha a forma de pagamento (1x, 2x ou 3x)</li>
            <li>Gere o PIX e efetue o pagamento</li>
          </ol>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://3000-ibfwiptn5oys7fapxxphs-172a66e2.us2.manus.computer/pagamento-danos" style="background: #3b82f6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
            Acessar Página de Pagamento
          </a>
        </div>
        
        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
          Em caso de dúvidas, estamos à disposição!
        </p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            Exclusive Club Itz<br>
            ${process.env.OWNER_NAME || 'atendimento@exclusiveclubitz.com'}
          </p>
        </div>
      </div>
    </div>
  `;
  
  return await sendEmail({
    to: data.clientEmail,
    subject,
    html,
    attachments: [],
  });
}

/**
 * Notifica cliente que orçamento de reparo está disponível
 */
export async function notifyClientBudgetAvailable(data: {
  clientEmail: string;
  clientName: string;
  vesselName: string;
  description: string;
  totalAmount: number;
  individualAmount: number;
}): Promise<boolean> {
  const subject = `💰 Orçamento Disponível - ${data.vesselName}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">💰 Orçamento Disponível</h1>
      </div>
      
      <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          Olá <strong>${escapeHtml(data.clientName)}</strong>,
        </p>
        
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          O orçamento do reparo da embarcação <strong>${escapeHtml(data.vesselName)}</strong> está disponível para pagamento!
        </p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #10b981;">
          <h3 style="color: #059669; font-size: 16px; margin-top: 0;">Detalhes do Orçamento:</h3>
          <p style="margin: 8px 0;"><strong>Descrição:</strong> ${escapeHtml(data.description)}</p>
          <p style="margin: 8px 0;"><strong>Valor Total:</strong> R$ ${data.totalAmount.toFixed(2)}</p>
          <p style="margin: 8px 0;"><strong>Seu Valor:</strong> R$ ${data.individualAmount.toFixed(2)}</p>
        </div>
        
        <div style="background: #dbeafe; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="color: #1e40af; font-size: 16px; margin-top: 0;">💳 Opções de Pagamento:</h3>
          <ul style="color: #374151; margin: 10px 0; padding-left: 20px; line-height: 1.8;">
            <li><strong>1x:</strong> À vista (vencimento imediato)</li>
            <li><strong>2x:</strong> Parcelado em 2 vezes (intervalo de 30 dias)</li>
            <li><strong>3x:</strong> Parcelado em 3 vezes (intervalo de 30 dias)</li>
          </ul>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://3000-ibfwiptn5oys7fapxxphs-172a66e2.us2.manus.computer/pagamento-danos" style="background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
            Pagar Agora
          </a>
        </div>
        
        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
          Em caso de dúvidas, estamos à disposição!
        </p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            Exclusive Club Itz<br>
            ${process.env.OWNER_NAME || 'atendimento@exclusiveclubitz.com'}
          </p>
        </div>
      </div>
    </div>
  `;
  
  return await sendEmail({
    to: data.clientEmail,
    subject,
    html,
    attachments: [],
  });
}

/**
 * Notifica cliente que solicitação de mudança de vencimento foi aprovada
 */
export async function notifyClientDueDateApproved(data: {
  clientEmail: string;
  clientName: string;
  chargeType: string;
  vesselName: string;
  newDueDate: string;
}): Promise<boolean> {
  const subject = `✅ Solicitação Aprovada - Nova Data de Vencimento`;
  
  const typeLabel = data.chargeType === 'inspection' ? 'Vistoria' : 'Reparo';
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">✅ Solicitação Aprovada</h1>
      </div>
      
      <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          Olá <strong>${escapeHtml(data.clientName)}</strong>,
        </p>
        
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          Sua solicitação de mudança de vencimento foi <strong>aprovada</strong>!
        </p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #10b981;">
          <h3 style="color: #059669; font-size: 16px; margin-top: 0;">Detalhes:</h3>
          <p style="margin: 8px 0;"><strong>Tipo:</strong> ${typeLabel}</p>
          <p style="margin: 8px 0;"><strong>Embarcação:</strong> ${escapeHtml(data.vesselName)}</p>
          <p style="margin: 8px 0;"><strong>Novo Vencimento:</strong> ${new Date(data.newDueDate).toLocaleDateString('pt-BR')}</p>
        </div>
        
        <div style="background: #d1fae5; padding: 15px; border-radius: 8px; border-left: 4px solid #10b981; margin-bottom: 20px;">
          <p style="margin: 0; color: #065f46; font-size: 14px;">
            <strong>✅ Confirmação:</strong> A data de vencimento foi atualizada no sistema. 
            Você pode efetuar o pagamento até a nova data sem multas ou juros.
          </p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://3000-ibfwiptn5oys7fapxxphs-172a66e2.us2.manus.computer/pagamento-danos" style="background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
            Ver Cobrança
          </a>
        </div>
        
        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
          Agradecemos pela compreensão!
        </p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            Exclusive Club Itz<br>
            ${process.env.OWNER_NAME || 'atendimento@exclusiveclubitz.com'}
          </p>
        </div>
      </div>
    </div>
  `;
  
  return await sendEmail({
    to: data.clientEmail,
    subject,
    html,
    attachments: [],
  });
}

/**
 * Notifica cliente que solicitação de mudança de vencimento foi rejeitada
 */
export async function notifyClientDueDateRejected(data: {
  clientEmail: string;
  clientName: string;
  chargeType: string;
  vesselName: string;
  reason: string;
}): Promise<boolean> {
  const subject = `❌ Solicitação Rejeitada - Mudança de Vencimento`;
  
  const typeLabel = data.chargeType === 'inspection' ? 'Vistoria' : 'Reparo';
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">❌ Solicitação Rejeitada</h1>
      </div>
      
      <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          Olá <strong>${escapeHtml(data.clientName)}</strong>,
        </p>
        
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          Infelizmente, sua solicitação de mudança de vencimento foi <strong>rejeitada</strong>.
        </p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #dc2626;">
          <h3 style="color: #991b1b; font-size: 16px; margin-top: 0;">Detalhes:</h3>
          <p style="margin: 8px 0;"><strong>Tipo:</strong> ${typeLabel}</p>
          <p style="margin: 8px 0;"><strong>Embarcação:</strong> ${escapeHtml(data.vesselName)}</p>
        </div>
        
        <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #f59e0b;">
          <h3 style="color: #92400e; font-size: 16px; margin-top: 0;">Motivo da Rejeição:</h3>
          <p style="margin: 0; color: #374151;">${escapeHtml(data.reason)}</p>
        </div>
        
        <div style="background: #dbeafe; padding: 15px; border-radius: 8px; border-left: 4px solid #3b82f6; margin-bottom: 20px;">
          <p style="margin: 0; color: #1e40af; font-size: 14px;">
            <strong>💡 Sugestão:</strong> Entre em contato conosco para discutir alternativas de pagamento 
            ou esclarecer dúvidas sobre a rejeição.
          </p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="https://3000-ibfwiptn5oys7fapxxphs-172a66e2.us2.manus.computer/pagamento-danos" style="background: #3b82f6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
            Ver Cobrança
          </a>
        </div>
        
        <p style="color: #6b7280; font-size: 14px; margin-top: 20px;">
          Estamos à disposição para ajudar!
        </p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            Exclusive Club Itz<br>
            ${process.env.OWNER_NAME || 'atendimento@exclusiveclubitz.com'}
          </p>
        </div>
      </div>
    </div>
  `;
  
  return await sendEmail({
    to: data.clientEmail,
    subject,
    html,
    attachments: [],
  });
}
