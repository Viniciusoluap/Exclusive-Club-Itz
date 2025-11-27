import puppeteer from 'puppeteer';
import { sendEmail } from './emailService';
import { ENV } from './env';

interface InspectionData {
  id: number;
  vesselName: string;
  vesselType: string;
  clientName: string;
  inspectionDate: string;
  inspectedBy: string;
  formData: Record<string, 'approved' | 'disapproved'>;
  notes?: string;
}

function generateInspectionHTML(data: InspectionData): string {
  const approvedCount = Object.values(data.formData).filter(v => v === 'approved').length;
  const totalFields = Object.keys(data.formData).length;
  const approvalRate = ((approvedCount / totalFields) * 100).toFixed(0);

  const fieldsHTML = Object.entries(data.formData).map(([field, status]) => {
    const icon = status === 'approved' 
      ? '✅' 
      : '❌';
    const statusText = status === 'approved' ? 'APROVADO' : 'REPROVADO';
    const statusColor = status === 'approved' ? '#10b981' : '#ef4444';

    return `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${field}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
          <span style="color: ${statusColor}; font-weight: 600;">
            ${icon} ${statusText}
          </span>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          margin: 0;
          padding: 40px;
          background: #f9fafb;
        }
        .container {
          max-width: 800px;
          margin: 0 auto;
          background: white;
          padding: 40px;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .header {
          text-align: center;
          margin-bottom: 40px;
          padding-bottom: 20px;
          border-bottom: 3px solid #0891b2;
        }
        .logo {
          font-size: 28px;
          font-weight: bold;
          color: #0891b2;
          margin-bottom: 10px;
        }
        .title {
          font-size: 24px;
          font-weight: 600;
          color: #1f2937;
          margin: 20px 0 10px 0;
        }
        .subtitle {
          font-size: 14px;
          color: #6b7280;
        }
        .info-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 30px;
          padding: 20px;
          background: #f9fafb;
          border-radius: 6px;
        }
        .info-item {
          margin-bottom: 10px;
        }
        .info-label {
          font-size: 12px;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          margin-bottom: 4px;
        }
        .info-value {
          font-size: 16px;
          color: #1f2937;
          font-weight: 500;
        }
        .summary {
          background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%);
          color: white;
          padding: 20px;
          border-radius: 6px;
          margin-bottom: 30px;
          text-align: center;
        }
        .summary-title {
          font-size: 14px;
          opacity: 0.9;
          margin-bottom: 8px;
        }
        .summary-value {
          font-size: 36px;
          font-weight: bold;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        th {
          background: #f3f4f6;
          padding: 12px;
          text-align: left;
          font-weight: 600;
          color: #374151;
          border-bottom: 2px solid #e5e7eb;
        }
        .notes {
          background: #fef3c7;
          border-left: 4px solid #f59e0b;
          padding: 16px;
          border-radius: 4px;
          margin-top: 20px;
        }
        .notes-title {
          font-weight: 600;
          color: #92400e;
          margin-bottom: 8px;
        }
        .notes-content {
          color: #78350f;
          line-height: 1.6;
        }
        .footer {
          text-align: center;
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          color: #6b7280;
          font-size: 12px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">⚓ EXCLUSIVE CLUB</div>
          <div class="title">Relatório de Vistoria</div>
          <div class="subtitle">Sistema de Compartilhamento de Embarcações</div>
        </div>

        <div class="info-grid">
          <div>
            <div class="info-item">
              <div class="info-label">Embarcação</div>
              <div class="info-value">${data.vesselName}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Tipo</div>
              <div class="info-value">${data.vesselType === 'jet' ? 'Jet Ski' : 'Lancha'}</div>
            </div>
          </div>
          <div>
            <div class="info-item">
              <div class="info-label">Cliente</div>
              <div class="info-value">${data.clientName}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Data da Vistoria</div>
              <div class="info-value">${new Date(data.inspectionDate).toLocaleDateString('pt-BR')}</div>
            </div>
          </div>
        </div>

        <div class="summary">
          <div class="summary-title">Taxa de Aprovação</div>
          <div class="summary-value">${approvalRate}%</div>
          <div style="margin-top: 8px; opacity: 0.9;">
            ${approvedCount} de ${totalFields} itens aprovados
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Item de Inspeção</th>
              <th style="text-align: center; width: 200px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${fieldsHTML}
          </tbody>
        </table>

        ${data.notes ? `
          <div class="notes">
            <div class="notes-title">📝 Observações</div>
            <div class="notes-content">${data.notes}</div>
          </div>
        ` : ''}

        <div class="footer">
          <div style="margin-bottom: 8px;">
            <strong>Vistoria realizada por:</strong> ${data.inspectedBy}
          </div>
          <div>
            Relatório gerado automaticamente em ${new Date().toLocaleString('pt-BR')}
          </div>
          <div style="margin-top: 12px;">
            © ${new Date().getFullYear()} Exclusive Club - Todos os direitos reservados
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

export async function generateInspectionPDF(data: InspectionData): Promise<Buffer> {
  const html = generateInspectionHTML(data);
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px',
      },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

export async function sendInspectionReportEmail(
  data: InspectionData,
  pdfBuffer: Buffer
): Promise<boolean> {
  const subject = `Vistoria Realizada - ${data.vesselName} - ${new Date(data.inspectionDate).toLocaleDateString('pt-BR')}`;
  
  const approvedCount = Object.values(data.formData).filter(v => v === 'approved').length;
  const totalFields = Object.keys(data.formData).length;
  const disapprovedItems = Object.entries(data.formData)
    .filter(([_, status]) => status === 'disapproved')
    .map(([field]) => field);

  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">⚓ Vistoria Realizada</h1>
        </div>
        
        <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px;">
          <h2 style="color: #0891b2; margin-top: 0;">Resumo da Vistoria</h2>
          
          <div style="background: white; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
            <p style="margin: 8px 0;"><strong>Embarcação:</strong> ${data.vesselName}</p>
            <p style="margin: 8px 0;"><strong>Cliente:</strong> ${data.clientName}</p>
            <p style="margin: 8px 0;"><strong>Data:</strong> ${new Date(data.inspectionDate).toLocaleDateString('pt-BR')}</p>
            <p style="margin: 8px 0;"><strong>Responsável:</strong> ${data.inspectedBy}</p>
          </div>

          <div style="background: ${disapprovedItems.length === 0 ? '#d1fae5' : '#fee2e2'}; padding: 20px; border-radius: 6px; margin-bottom: 20px; border-left: 4px solid ${disapprovedItems.length === 0 ? '#10b981' : '#ef4444'};">
            <h3 style="margin: 0 0 10px 0; color: ${disapprovedItems.length === 0 ? '#065f46' : '#991b1b'};">
              ${disapprovedItems.length === 0 ? '✅ Vistoria Aprovada' : '⚠️ Itens Reprovados'}
            </h3>
            <p style="margin: 0; color: ${disapprovedItems.length === 0 ? '#047857' : '#b91c1c'};">
              ${approvedCount} de ${totalFields} itens aprovados
            </p>
            ${disapprovedItems.length > 0 ? `
              <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #991b1b;">
                ${disapprovedItems.map(item => `<li>${item}</li>`).join('')}
              </ul>
            ` : ''}
          </div>

          ${data.notes ? `
            <div style="background: #fef3c7; padding: 16px; border-radius: 6px; border-left: 4px solid #f59e0b;">
              <p style="margin: 0; font-weight: 600; color: #92400e;">📝 Observações:</p>
              <p style="margin: 8px 0 0 0; color: #78350f;">${data.notes}</p>
            </div>
          ` : ''}

          <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">
            O relatório completo em PDF está anexado a este email.
          </p>
        </div>

        <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
          <p>© ${new Date().getFullYear()} Exclusive Club - Sistema de Compartilhamento de Embarcações</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const filename = `vistoria-${data.vesselName.replace(/\s+/g, '-')}-${new Date(data.inspectionDate).toISOString().split('T')[0]}.pdf`;

  console.log('[Inspection PDF] Relatório gerado:', filename);
  console.log('[Inspection PDF] Enviando email com PDF anexado para admin...');
  
  // Enviar email com PDF anexado usando sendEmail com suporte a attachments
  const adminEmail = process.env.ADMIN_EMAIL || 'atendimento@exclusiveclubitz.com';
  
  const success = await sendEmail({
    to: adminEmail,
    subject,
    html: htmlBody,
    attachments: [
      {
        filename,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }
    ]
  });
  
  if (success) {
    console.log('[Inspection PDF] Email enviado com sucesso para:', adminEmail);
  } else {
    console.error('[Inspection PDF] Falha ao enviar email');
  }
  
  return success;
}
