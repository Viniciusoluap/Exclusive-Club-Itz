import PDFDocument from 'pdfkit';

interface FuelRecordData {
  id: number;
  vesselName: string;
  employeeName?: string;
  date: Date | string;
  liters: number; // em centavos
  pricePerLiter: number; // em centavos
  subtotal: number; // em centavos
  serviceFee: number; // em centavos
  totalAmount: number; // em centavos
  notes?: string;
}

export async function generateFuelRecordsPDF(records: FuelRecordData[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ 
      size: 'A4', 
      layout: 'landscape',
      margin: 40 
    });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Cabeçalho
    doc.fontSize(24).fillColor('#0891b2').text('EXCLUSIVE CLUB', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(18).fillColor('#1f2937').text('Relatório de Abastecimentos', { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor('#6b7280').text('Sistema de Compartilhamento de Embarcações', { align: 'center' });
    doc.moveDown(1.5);

    // Linha separadora
    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor('#0891b2').lineWidth(2).stroke();
    doc.moveDown(1);

    // Cards de resumo
    const totalLiters = records.reduce((sum, r) => sum + r.liters, 0) / 100;
    const totalAmount = records.reduce((sum, r) => sum + r.totalAmount, 0) / 100;
    const totalFees = (records.length * 1000) / 100; // R$ 10.00 por registro

    const cardWidth = (doc.page.width - 120) / 4;
    const cardHeight = 60;
    const startX = 40;
    const startY = doc.y;

    // Card 1: Total de Registros
    doc.rect(startX, startY, cardWidth, cardHeight).fillAndStroke('#0891b2', '#0891b2');
    doc.fillColor('#ffffff').fontSize(9).text('TOTAL DE REGISTROS', startX + 10, startY + 10, { width: cardWidth - 20, align: 'center' });
    doc.fontSize(20).text(records.length.toString(), startX + 10, startY + 28, { width: cardWidth - 20, align: 'center' });

    // Card 2: Total de Litros
    doc.rect(startX + cardWidth + 10, startY, cardWidth, cardHeight).fillAndStroke('#0891b2', '#0891b2');
    doc.fillColor('#ffffff').fontSize(9).text('TOTAL DE LITROS', startX + cardWidth + 20, startY + 10, { width: cardWidth - 20, align: 'center' });
    doc.fontSize(20).text(`${totalLiters.toFixed(2)}L`, startX + cardWidth + 20, startY + 28, { width: cardWidth - 20, align: 'center' });

    // Card 3: Total de Taxas
    doc.rect(startX + (cardWidth + 10) * 2, startY, cardWidth, cardHeight).fillAndStroke('#0891b2', '#0891b2');
    doc.fillColor('#ffffff').fontSize(9).text('TOTAL DE TAXAS', startX + (cardWidth + 10) * 2 + 10, startY + 10, { width: cardWidth - 20, align: 'center' });
    doc.fontSize(20).text(`R$ ${totalFees.toFixed(2)}`, startX + (cardWidth + 10) * 2 + 10, startY + 28, { width: cardWidth - 20, align: 'center' });

    // Card 4: Valor Total
    doc.rect(startX + (cardWidth + 10) * 3, startY, cardWidth, cardHeight).fillAndStroke('#0891b2', '#0891b2');
    doc.fillColor('#ffffff').fontSize(9).text('VALOR TOTAL', startX + (cardWidth + 10) * 3 + 10, startY + 10, { width: cardWidth - 20, align: 'center' });
    doc.fontSize(20).text(`R$ ${totalAmount.toFixed(2)}`, startX + (cardWidth + 10) * 3 + 10, startY + 28, { width: cardWidth - 20, align: 'center' });

    doc.y = startY + cardHeight + 20;
    doc.moveDown(1);

    // Tabela de registros
    const tableTop = doc.y;
    const colWidths = [30, 140, 100, 70, 60, 70, 70, 70, 80]; // Ajustado para 9 colunas
    const headers = ['#', 'Embarcação', 'Funcionário', 'Data', 'Litros', 'Preço/L', 'Subtotal', 'Taxa', 'Total'];
    
    // Cabeçalho da tabela
    let xPos = 40;
    doc.fillColor('#f3f4f6').rect(40, tableTop, doc.page.width - 80, 25).fill();
    
    headers.forEach((header, i) => {
      doc.fillColor('#374151').fontSize(9).text(header, xPos + 5, tableTop + 8, { 
        width: colWidths[i] - 10, 
        align: i === 0 || i === 3 || i >= 4 ? 'center' : 'left' 
      });
      xPos += colWidths[i];
    });

    doc.y = tableTop + 25;

    // Linhas de dados
    records.forEach((record, index) => {
      const rowY = doc.y;
      
      // Verificar se precisa de nova página
      if (rowY > doc.page.height - 100) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 40 });
        doc.y = 40;
      }

      const litersValue = record.liters / 100;
      const pricePerLiterValue = record.pricePerLiter / 100;
      const subtotalValue = record.subtotal / 100;
      const serviceFeeValue = record.serviceFee / 100;
      const totalValue = record.totalAmount / 100;
      const date = new Date(record.date);
      const dateStr = date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

      xPos = 40;
      const rowData = [
        { text: (index + 1).toString(), align: 'center' },
        { text: record.vesselName || 'N/A', align: 'left' },
        { text: record.employeeName || 'N/A', align: 'left' },
        { text: dateStr, align: 'center' },
        { text: `${litersValue.toFixed(2)}L`, align: 'center' },
        { text: `R$ ${pricePerLiterValue.toFixed(2)}`, align: 'right' },
        { text: `R$ ${subtotalValue.toFixed(2)}`, align: 'right' },
        { text: `R$ ${serviceFeeValue.toFixed(2)}`, align: 'right' },
        { text: `R$ ${totalValue.toFixed(2)}`, align: 'right' }
      ];

      rowData.forEach((data, i) => {
        doc.fillColor('#1f2937').fontSize(8).text(data.text, xPos + 5, rowY + 5, { 
          width: colWidths[i] - 10, 
          align: data.align as any
        });
        xPos += colWidths[i];
      });

      // Linha separadora
      doc.moveTo(40, rowY + 20).lineTo(doc.page.width - 40, rowY + 20).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
      doc.y = rowY + 22;

      // Observações (se houver)
      if (record.notes) {
        const notesY = doc.y;
        doc.fillColor('#fef3c7').rect(40, notesY, doc.page.width - 80, 20).fill();
        doc.fillColor('#78350f').fontSize(8).text(`📝 Observações: ${record.notes}`, 45, notesY + 6, { 
          width: doc.page.width - 90 
        });
        doc.y = notesY + 22;
      }
    });

    // Rodapé
    doc.moveDown(2);
    const footerY = doc.y;
    doc.moveTo(40, footerY).lineTo(doc.page.width - 40, footerY).strokeColor('#e5e7eb').lineWidth(1).stroke();
    doc.moveDown(0.5);
    
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    doc.fillColor('#6b7280').fontSize(8).text(`Relatório gerado automaticamente em ${now}`, { align: 'center' });
    doc.fontSize(8).text(`© ${new Date().getFullYear()} Exclusive Club - Todos os direitos reservados`, { align: 'center' });

    doc.end();
  });
}
