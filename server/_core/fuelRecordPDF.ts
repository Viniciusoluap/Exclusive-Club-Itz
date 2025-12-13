import PDFDocument from 'pdfkit';

interface FuelRecordData {
  id: number;
  vesselName: string;
  employeeName: string;
  date: Date | string;
  liters: number; // em centavos
  pricePerLiter: number; // em centavos
  subtotal: number; // em centavos
  serviceFee: number; // em centavos
  totalAmount: number; // em centavos
  notes?: string | null;
}

export async function generateFuelRecordsPDF(records: FuelRecordData[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        size: 'A4', 
        layout: 'landscape',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });
      
      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Cabeçalho
      doc.fontSize(24).fillColor('#0891b2').text('⚓ EXCLUSIVE CLUB', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(18).fillColor('#1f2937').text('Relatório de Abastecimentos', { align: 'center' });
      doc.moveDown(0.2);
      doc.fontSize(10).fillColor('#6b7280').text('Sistema de Compartilhamento de Embarcações', { align: 'center' });
      doc.moveDown(1);

      // Linha separadora
      doc.moveTo(50, doc.y).lineTo(792 - 50, doc.y).stroke('#0891b2');
      doc.moveDown(1);

      // Resumo
      const totalLiters = records.reduce((sum, r) => sum + r.liters, 0) / 100;
      const totalAmount = records.reduce((sum, r) => sum + r.totalAmount, 0) / 100;

      const summaryY = doc.y;
      const boxWidth = 200;
      const boxHeight = 60;
      const gap = 30;
      const startX = (792 - (boxWidth * 3 + gap * 2)) / 2;

      // Box 1: Total de Registros
      doc.rect(startX, summaryY, boxWidth, boxHeight).fill('#0891b2');
      doc.fillColor('#ffffff').fontSize(10).text('TOTAL DE REGISTROS', startX, summaryY + 15, { width: boxWidth, align: 'center' });
      doc.fontSize(20).text(records.length.toString(), startX, summaryY + 32, { width: boxWidth, align: 'center' });

      // Box 2: Total de Litros
      doc.rect(startX + boxWidth + gap, summaryY, boxWidth, boxHeight).fill('#0891b2');
      doc.fillColor('#ffffff').fontSize(10).text('TOTAL DE LITROS', startX + boxWidth + gap, summaryY + 15, { width: boxWidth, align: 'center' });
      doc.fontSize(20).text(`${totalLiters.toFixed(2)}L`, startX + boxWidth + gap, summaryY + 32, { width: boxWidth, align: 'center' });

      // Box 3: Valor Total
      doc.rect(startX + (boxWidth + gap) * 2, summaryY, boxWidth, boxHeight).fill('#0891b2');
      doc.fillColor('#ffffff').fontSize(10).text('VALOR TOTAL', startX + (boxWidth + gap) * 2, summaryY + 15, { width: boxWidth, align: 'center' });
      doc.fontSize(20).text(`R$ ${totalAmount.toFixed(2)}`, startX + (boxWidth + gap) * 2, summaryY + 32, { width: boxWidth, align: 'center' });

      doc.y = summaryY + boxHeight + 30;

      // Tabela
      const tableTop = doc.y;
      const colWidths = [30, 150, 100, 70, 60, 70, 70, 70, 80];
      const colX = [50];
      for (let i = 1; i < colWidths.length; i++) {
        colX.push(colX[i - 1] + colWidths[i - 1]);
      }

      // Cabeçalho da tabela
      doc.rect(50, tableTop, 792 - 100, 25).fill('#f3f4f6');
      doc.fillColor('#374151').fontSize(9).font('Helvetica-Bold');
      doc.text('#', colX[0], tableTop + 8, { width: colWidths[0], align: 'center' });
      doc.text('Embarcação', colX[1], tableTop + 8, { width: colWidths[1] });
      doc.text('Funcionário', colX[2], tableTop + 8, { width: colWidths[2] });
      doc.text('Data', colX[3], tableTop + 8, { width: colWidths[3], align: 'center' });
      doc.text('Litros', colX[4], tableTop + 8, { width: colWidths[4], align: 'right' });
      doc.text('Preço/L', colX[5], tableTop + 8, { width: colWidths[5], align: 'right' });
      doc.text('Subtotal', colX[6], tableTop + 8, { width: colWidths[6], align: 'right' });
      doc.text('Taxa', colX[7], tableTop + 8, { width: colWidths[7], align: 'right' });
      doc.text('Total', colX[8], tableTop + 8, { width: colWidths[8], align: 'right' });

      doc.y = tableTop + 25;
      doc.font('Helvetica');

      // Linhas da tabela
      records.forEach((record, index) => {
        const rowY = doc.y;
        const litersValue = record.liters / 100;
        const pricePerLiterValue = record.pricePerLiter / 100;
        const subtotalValue = record.subtotal / 100;
        const serviceFeeValue = record.serviceFee / 100;
        const totalValue = record.totalAmount / 100;
        const date = new Date(record.date);

        // Verificar se precisa de nova página
        if (rowY > 500) {
          doc.addPage({ size: 'A4', layout: 'landscape', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
          doc.y = 50;
        }

        const currentY = doc.y;

        doc.fillColor('#1f2937').fontSize(8);
        doc.text((index + 1).toString(), colX[0], currentY + 5, { width: colWidths[0], align: 'center' });
        doc.text(record.vesselName, colX[1], currentY + 5, { width: colWidths[1] });
        doc.text(record.employeeName, colX[2], currentY + 5, { width: colWidths[2] });
        doc.text(date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }), colX[3], currentY + 5, { width: colWidths[3], align: 'center' });
        doc.text(`${litersValue.toFixed(2)}L`, colX[4], currentY + 5, { width: colWidths[4], align: 'right' });
        doc.text(`R$ ${pricePerLiterValue.toFixed(2)}`, colX[5], currentY + 5, { width: colWidths[5], align: 'right' });
        doc.text(`R$ ${subtotalValue.toFixed(2)}`, colX[6], currentY + 5, { width: colWidths[6], align: 'right' });
        doc.text(`R$ ${serviceFeeValue.toFixed(2)}`, colX[7], currentY + 5, { width: colWidths[7], align: 'right' });
        doc.fillColor('#0891b2').text(`R$ ${totalValue.toFixed(2)}`, colX[8], currentY + 5, { width: colWidths[8], align: 'right' });

        doc.y = currentY + 20;

        // Linha separadora
        doc.moveTo(50, doc.y).lineTo(792 - 50, doc.y).strokeColor('#e5e7eb').stroke();

        // Observações (se houver)
        if (record.notes) {
          doc.y += 5;
          doc.rect(50, doc.y, 792 - 100, 20).fill('#fef3c7');
          doc.fillColor('#78350f').fontSize(7).text(`📝 Observações: ${record.notes}`, 55, doc.y + 6, { width: 792 - 110 });
          doc.y += 20;
          doc.moveTo(50, doc.y).lineTo(792 - 50, doc.y).strokeColor('#e5e7eb').stroke();
        }

        doc.y += 5;
      });

      // Rodapé
      doc.moveDown(2);
      doc.rect(50, doc.y, 792 - 100, 30).fill('#f3f4f6');
      doc.fillColor('#6b7280').fontSize(9).text(
        `Relatório gerado automaticamente em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
        50,
        doc.y + 8,
        { width: 792 - 100, align: 'center' }
      );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
