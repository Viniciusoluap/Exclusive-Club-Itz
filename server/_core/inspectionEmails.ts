import { sendEmail } from "./emailService";
import { ENV } from "./env";

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
          <p style="margin: 8px 0;"><strong>Cliente:</strong> ${inspection.clientName}</p>
          <p style="margin: 8px 0;"><strong>Email:</strong> ${inspection.clientEmail}</p>
          <p style="margin: 8px 0;"><strong>Embarcação:</strong> ${inspection.vesselName} (${inspection.vesselType})</p>
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
          Olá <strong>${inspection.clientName}</strong>,
        </p>
        
        <p style="font-size: 16px; color: #374151; margin-bottom: 20px;">
          Durante a vistoria da embarcação <strong>${inspection.vesselName}</strong> realizada em <strong>${inspection.inspectionDate}</strong>, 
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
