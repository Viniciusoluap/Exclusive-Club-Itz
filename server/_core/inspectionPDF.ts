import PDFDocument from 'pdfkit';
import { sendEmail } from './emailService';
import { ENV } from './env';

interface InspectionData {
  id: number;
  vesselName: string;
  vesselType: string;
  clientName: string;
  inspectionDate: string;
  inspectedBy: string;
  formData: Record<string, 'APROVADO' | 'REPROVADO'>;
  notes?: string;
}

function generateInspectionHTML(data: InspectionData): string {
  const approvedCount = Object.values(data.formData).filter(v => v === 'APROVADO').length;
  const totalFields = Object.keys(data.formData).length;
  const approvalRate = totalFields > 0 ? ((approvedCount / totalFields) * 100).toFixed(0) : '0';

  const fieldsHTML = Object.entries(data.formData).map(([field, status]) => {
    const icon = status === 'APROVADO' 
      ? '✅' 
      : '❌';
    const statusText = status === 'APROVADO' ? 'APROVADO' : 'REPROVADO';
    const statusColor = status === 'APROVADO' ? '#10b981' : '#ef4444';

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

  // Listar itens reprovados
  const failedItems = Object.entries(data.formData)
    .filter(([_, status]) => status === 'REPROVADO')
    .map(([field]) => field);
  
  const failedItemsHTML = failedItems.length > 0 ? `
    <div style="background: #fee2e2; border-left: 4px solid #ef4444; padding: 16px; border-radius: 4px; margin-bottom: 20px;">
      <div style="font-weight: 600; color: #991b1b; margin-bottom: 12px; font-size: 16px;">❌ Itens Reprovados (${failedItems.length})</div>
      <ul style="margin: 0; padding-left: 20px; color: #7f1d1d; line-height: 1.8;">
        ${failedItems.map(item => `<li>${item}</li>`).join('')}
      </ul>
    </div>
  ` : '';

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
            <div class="info-item">
              <div class="info-label">Cliente</div>
              <div class="info-value">${data.clientName}</div>
            </div>
          </div>
          <div>
            <div class="info-item">
              <div class="info-label">Data da Vistoria</div>
              <div class="info-value">${new Date(data.inspectionDate).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Horário</div>
              <div class="info-value">${new Date(data.inspectionDate).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Vistoriado por</div>
              <div class="info-value">${data.inspectedBy || 'N/A'}</div>
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

        ${failedItemsHTML}

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
            Relatório gerado automaticamente em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
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
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const buffers: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const approvedCount = Object.values(data.formData).filter(v => v === 'APROVADO').length;
    const totalFields = Object.keys(data.formData).length;
    const approvalRate = totalFields > 0 ? ((approvedCount / totalFields) * 100).toFixed(0) : '0';
    const failedItems = Object.entries(data.formData)
      .filter(([_, status]) => status === 'REPROVADO')
      .map(([field]) => field);

    const BLUE = '#0891b2';
    const RED = '#ef4444';
    const GREEN = '#10b981';
    const GRAY = '#6b7280';
    const pageW = doc.page.width - 100;

    // Header
    doc.fillColor(BLUE).fontSize(20).font('Helvetica-Bold').text('EXCLUSIVE CLUB', { align: 'center' });
    doc.fillColor(GRAY).fontSize(10).font('Helvetica').text('Sistema de Compartilhamento de Embarcações', { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(50 + pageW, doc.y).strokeColor(BLUE).lineWidth(2).stroke();
    doc.moveDown(0.8);

    // Title
    doc.fillColor('#1f2937').fontSize(16).font('Helvetica-Bold').text('Relatório de Vistoria', { align: 'center' });
    doc.moveDown(1);

    // Info grid
    const infoY = doc.y;
    doc.rect(50, infoY, pageW, 90).fillColor('#f9fafb').fill();
    doc.rect(50, infoY, pageW, 90).strokeColor('#e5e7eb').lineWidth(0.5).stroke();

    const col1X = 60;
    const col2X = 50 + pageW / 2 + 10;
    let infoLineY = infoY + 12;
    const lineH = 20;

    const infoItems: Array<[string, string]> = [
      ['Embarcação', data.vesselName],
      ['Tipo', data.vesselType === 'jet' || data.vesselType === 'jetski' ? 'Jet Ski' : 'Lancha'],
      ['Cliente', data.clientName],
    ];
    const infoItems2: Array<[string, string]> = [
      ['Data da Vistoria', new Date(data.inspectionDate).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })],
      ['Horário', new Date(data.inspectionDate).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })],
      ['Vistoriado por', data.inspectedBy || 'N/A'],
    ];

    for (let i = 0; i < infoItems.length; i++) {
      doc.fillColor(GRAY).fontSize(8).font('Helvetica').text(infoItems[i][0].toUpperCase(), col1X, infoLineY + i * lineH);
      doc.fillColor('#1f2937').fontSize(10).font('Helvetica-Bold').text(infoItems[i][1], col1X, infoLineY + i * lineH + 9, { width: pageW / 2 - 20, lineBreak: false });
    }
    for (let i = 0; i < infoItems2.length; i++) {
      doc.fillColor(GRAY).fontSize(8).font('Helvetica').text(infoItems2[i][0].toUpperCase(), col2X, infoLineY + i * lineH);
      doc.fillColor('#1f2937').fontSize(10).font('Helvetica-Bold').text(infoItems2[i][1], col2X, infoLineY + i * lineH + 9, { width: pageW / 2 - 20, lineBreak: false });
    }

    doc.y = infoY + 90 + 15;

    // Approval rate summary box
    const summaryY = doc.y;
    const summaryH = 60;
    doc.rect(50, summaryY, pageW, summaryH).fillColor(BLUE).fill();
    doc.fillColor('#ffffff').fontSize(11).font('Helvetica').text('Taxa de Aprovação', 50, summaryY + 10, { width: pageW, align: 'center' });
    doc.fillColor('#ffffff').fontSize(28).font('Helvetica-Bold').text(`${approvalRate}%`, 50, summaryY + 24, { width: pageW, align: 'center' });
    doc.fillColor('rgba(255,255,255,0.85)').fontSize(9).font('Helvetica').text(`${approvedCount} de ${totalFields} itens aprovados`, 50, summaryY + 48, { width: pageW, align: 'center' });
    doc.y = summaryY + summaryH + 15;

    // Items table
    const headerY = doc.y;
    doc.rect(50, headerY, pageW * 0.65, 20).fillColor('#f3f4f6').fill();
    doc.rect(50 + pageW * 0.65, headerY, pageW * 0.35, 20).fillColor('#f3f4f6').fill();
    doc.rect(50, headerY, pageW, 20).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
    doc.fillColor('#374151').fontSize(9).font('Helvetica-Bold').text('Item de Inspeção', 56, headerY + 5, { width: pageW * 0.65 - 12, lineBreak: false });
    doc.fillColor('#374151').fontSize(9).font('Helvetica-Bold').text('Status', 50 + pageW * 0.65 + 4, headerY + 5, { width: pageW * 0.35 - 8, align: 'center', lineBreak: false });

    let rowY = headerY + 20;
    let rowIndex = 0;
    for (const [field, status] of Object.entries(data.formData)) {
      const isApproved = status === 'APROVADO';
      const rowH = 18;
      const bgColor = rowIndex % 2 === 0 ? '#ffffff' : '#f9fafb';
      doc.rect(50, rowY, pageW, rowH).fillColor(bgColor).fill();
      doc.rect(50, rowY, pageW, rowH).strokeColor('#e5e7eb').lineWidth(0.3).stroke();
      doc.fillColor('#1f2937').fontSize(8.5).font('Helvetica').text(field, 56, rowY + 4, { width: pageW * 0.65 - 12, lineBreak: false });
      doc.fillColor(isApproved ? GREEN : RED).fontSize(8.5).font('Helvetica-Bold').text(isApproved ? 'APROVADO' : 'REPROVADO', 50 + pageW * 0.65 + 4, rowY + 4, { width: pageW * 0.35 - 8, align: 'center', lineBreak: false });
      rowY += rowH;
      rowIndex++;
    }
    doc.y = rowY + 10;

    // Failed items
    if (failedItems.length > 0) {
      const failY = doc.y;
      const failH = failedItems.length * 16 + 40;
      doc.rect(50, failY, pageW, failH).fillColor('#fee2e2').fill();
      doc.rect(50, failY, 4, failH).fillColor(RED).fill();
      doc.fillColor('#991b1b').fontSize(10).font('Helvetica-Bold').text(`Itens Reprovados (${failedItems.length})`, 62, failY + 10);
      let itemY = failY + 26;
      for (const item of failedItems) {
        doc.fillColor('#7f1d1d').fontSize(9).font('Helvetica').text(`• ${item}`, 70, itemY, { width: pageW - 30, lineBreak: false });
        itemY += 16;
      }
      doc.y = failY + failH + 10;
    }

    // Notes
    if (data.notes) {
      const notesY = doc.y;
      const notesText = data.notes;
      const notesH = doc.heightOfString(notesText, { width: pageW - 24 }) + 40;
      doc.rect(50, notesY, pageW, notesH).fillColor('#fef3c7').fill();
      doc.rect(50, notesY, 4, notesH).fillColor('#f59e0b').fill();
      doc.fillColor('#92400e').fontSize(10).font('Helvetica-Bold').text('Observações', 62, notesY + 10);
      doc.fillColor('#78350f').fontSize(9).font('Helvetica').text(notesText, 62, notesY + 26, { width: pageW - 24, lineGap: 1 });
      doc.y = notesY + notesH + 10;
    }

    // Footer
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(50 + pageW, doc.y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
    doc.moveDown(0.5);
    doc.fillColor(GRAY).fontSize(9).font('Helvetica-Bold').text(`Vistoria realizada por: ${data.inspectedBy}`, { align: 'center' });
    doc.fillColor(GRAY).fontSize(8).font('Helvetica').text(
      `Relatório gerado automaticamente em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
      { align: 'center' }
    );
    doc.fillColor(GRAY).fontSize(8).text(`© ${new Date().getFullYear()} Exclusive Club - Todos os direitos reservados`, { align: 'center' });

    doc.end();
  });
}

export async function sendInspectionReportEmail(
  data: InspectionData,
  pdfBuffer: Buffer
): Promise<boolean> {
  const subject = `Vistoria Realizada - ${data.vesselName} - ${new Date(data.inspectionDate).toLocaleDateString('pt-BR')}`;
  
  const approvedCount = Object.values(data.formData).filter(v => v === 'APROVADO').length;
  const totalFields = Object.keys(data.formData).length;
  const disapprovedItems = Object.entries(data.formData)
    .filter(([_, status]) => status === 'REPROVADO')
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
            <p style="margin: 8px 0;"><strong>Data:</strong> ${new Date(data.inspectionDate).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
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
