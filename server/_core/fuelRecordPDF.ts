import puppeteer from 'puppeteer';

interface FuelRecordData {
  id: number;
  vesselName: string;
  clientName: string;
  clientEmail: string;
  liters: number; // em centavos
  pricePerLiter: number; // em centavos
  totalAmount: number; // em centavos
  notes?: string;
  createdAt: Date | string;
  bookingDate?: string;
}

function generateFuelRecordsHTML(records: FuelRecordData[]): string {
  const totalLiters = records.reduce((sum, r) => sum + r.liters, 0) / 100;
  const totalAmount = records.reduce((sum, r) => sum + r.totalAmount, 0) / 100;
  const avgPricePerLiter = records.length > 0 
    ? (records.reduce((sum, r) => sum + r.pricePerLiter, 0) / records.length / 100)
    : 0;

  const recordsHTML = records.map((record, index) => {
    const litersValue = record.liters / 100;
    const pricePerLiterValue = record.pricePerLiter / 100;
    const totalValue = record.totalAmount / 100;
    const date = new Date(record.createdAt);

    return `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 12px; text-align: center;">${index + 1}</td>
        <td style="padding: 12px;">${record.vesselName}</td>
        <td style="padding: 12px;">${record.clientName}</td>
        <td style="padding: 12px; text-align: center;">${date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
        <td style="padding: 12px; text-align: right;">${litersValue.toFixed(2)}L</td>
        <td style="padding: 12px; text-align: right;">R$ ${pricePerLiterValue.toFixed(2)}</td>
        <td style="padding: 12px; text-align: right; font-weight: 600; color: #0891b2;">R$ ${totalValue.toFixed(2)}</td>
      </tr>
      ${record.notes ? `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td colspan="7" style="padding: 8px 12px; background: #fef3c7; font-size: 13px; color: #78350f;">
            <strong>📝 Observações:</strong> ${record.notes}
          </td>
        </tr>
      ` : ''}
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
          max-width: 900px;
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
        .summary {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
          margin-bottom: 30px;
        }
        .summary-card {
          background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%);
          color: white;
          padding: 20px;
          border-radius: 6px;
          text-align: center;
        }
        .summary-label {
          font-size: 12px;
          opacity: 0.9;
          margin-bottom: 8px;
          text-transform: uppercase;
        }
        .summary-value {
          font-size: 24px;
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
          font-size: 13px;
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
          <div class="title">Relatório de Abastecimentos</div>
          <div class="subtitle">Sistema de Compartilhamento de Embarcações</div>
        </div>

        <div class="summary">
          <div class="summary-card">
            <div class="summary-label">Total de Registros</div>
            <div class="summary-value">${records.length}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Total de Litros</div>
            <div class="summary-value">${totalLiters.toFixed(2)}L</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Valor Total</div>
            <div class="summary-value">R$ ${totalAmount.toFixed(2)}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="text-align: center; width: 40px;">#</th>
              <th>Embarcação</th>
              <th>Cliente</th>
              <th style="text-align: center; width: 100px;">Data</th>
              <th style="text-align: right; width: 80px;">Litros</th>
              <th style="text-align: right; width: 90px;">Preço/L</th>
              <th style="text-align: right; width: 100px;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${recordsHTML}
          </tbody>
        </table>

        <div style="background: #f3f4f6; padding: 16px; border-radius: 6px; margin-top: 20px;">
          <p style="margin: 0; font-size: 14px; color: #6b7280;">
            <strong>Preço médio por litro:</strong> R$ ${avgPricePerLiter.toFixed(2)}
          </p>
        </div>

        <div class="footer">
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

export async function generateFuelRecordsPDF(records: FuelRecordData[]): Promise<Buffer> {
  const html = generateFuelRecordsHTML(records);
  
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/chromium-browser',
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
      landscape: true, // Paisagem para caber mais colunas
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
