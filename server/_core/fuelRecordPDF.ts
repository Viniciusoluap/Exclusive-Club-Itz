import PDFDocument from 'pdfkit';
import { CORES, baixarImagemExterna } from './pdfBase';

interface FuelRecordData {
  id: number;
  vesselName: string;
  clientName?: string;
  employeeName?: string;
  date: Date | string;
  liters: number; // em centavos
  pricePerLiter: number; // em centavos
  subtotal: number; // em centavos
  serviceFee: number; // em centavos
  totalAmount: number; // em centavos
  notes?: string;
  // Campos de pesagem (opcionais)
  litersInitial?: number | null; // em centavos
  weightFull?: number | null; // em gramas (centavos)
  weightAfter?: number | null; // em gramas (centavos)
  weightConsumed?: number | null; // em gramas (centavos)
  litersCalculated?: number | null; // em centavos
  photoBeforeUrl?: string | null;
  photoAfterUrl?: string | null;
}

export async function generateFuelRecordsPDF(records: FuelRecordData[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ 
      size: 'A4', 
      layout: 'landscape',
      margin: 40,
      bufferPages: true // Necessário para adicionar imagens
    });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Cabeçalho
    doc.fontSize(24).fillColor(CORES.marca).text('EXCLUSIVE CLUB', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(18).fillColor(CORES.tintaEscura).text('Relatório de Abastecimentos', { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor(CORES.cinza).text('Sistema de Compartilhamento de Embarcações', { align: 'center' });
    doc.moveDown(1.5);

    // Linha separadora
    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor(CORES.marca).lineWidth(2).stroke();
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
    doc.fillColor(CORES.branco).fontSize(9).text('TOTAL DE REGISTROS', startX + 10, startY + 10, { width: cardWidth - 20, align: 'center' });
    doc.fontSize(20).text(records.length.toString(), startX + 10, startY + 28, { width: cardWidth - 20, align: 'center' });

    // Card 2: Total de Litros
    doc.rect(startX + cardWidth + 10, startY, cardWidth, cardHeight).fillAndStroke('#0891b2', '#0891b2');
    doc.fillColor(CORES.branco).fontSize(9).text('TOTAL DE LITROS', startX + cardWidth + 20, startY + 10, { width: cardWidth - 20, align: 'center' });
    doc.fontSize(20).text(`${totalLiters.toFixed(2)}L`, startX + cardWidth + 20, startY + 28, { width: cardWidth - 20, align: 'center' });

    // Card 3: Total de Taxas
    doc.rect(startX + (cardWidth + 10) * 2, startY, cardWidth, cardHeight).fillAndStroke('#0891b2', '#0891b2');
    doc.fillColor(CORES.branco).fontSize(9).text('TOTAL DE TAXAS', startX + (cardWidth + 10) * 2 + 10, startY + 10, { width: cardWidth - 20, align: 'center' });
    doc.fontSize(20).text(`R$ ${totalFees.toFixed(2)}`, startX + (cardWidth + 10) * 2 + 10, startY + 28, { width: cardWidth - 20, align: 'center' });

    // Card 4: Valor Total
    doc.rect(startX + (cardWidth + 10) * 3, startY, cardWidth, cardHeight).fillAndStroke('#0891b2', '#0891b2');
    doc.fillColor(CORES.branco).fontSize(9).text('VALOR TOTAL', startX + (cardWidth + 10) * 3 + 10, startY + 10, { width: cardWidth - 20, align: 'center' });
    doc.fontSize(20).text(`R$ ${totalAmount.toFixed(2)}`, startX + (cardWidth + 10) * 3 + 10, startY + 28, { width: cardWidth - 20, align: 'center' });

    doc.y = startY + cardHeight + 20;
    doc.moveDown(1);

    // Tabela de registros
    const tableTop = doc.y;
    const colWidths = [30, 120, 100, 90, 60, 50, 60, 60, 60, 70]; // Ajustado para 10 colunas
    const headers = ['#', 'Embarcação', 'Cliente', 'Funcionário', 'Data', 'Litros', 'Preço/L', 'Subtotal', 'Taxa', 'Total'];
    
    // Cabeçalho da tabela
    let xPos = 40;
    doc.fillColor('#f3f4f6').rect(40, tableTop, doc.page.width - 80, 25).fill();
    
    headers.forEach((header, i) => {
      doc.fillColor(CORES.rotulo).fontSize(9).text(header, xPos + 5, tableTop + 8, { 
        width: colWidths[i] - 10, 
        align: i === 0 || i === 4 || i >= 5 ? 'center' : 'left' 
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
        { text: (record.vesselName || 'N/A').normalize('NFC'), align: 'left' },
        { text: (record.clientName || 'N/A').normalize('NFC'), align: 'left' },
        { text: (record.employeeName || 'N/A').normalize('NFC'), align: 'left' },
        { text: dateStr, align: 'center' },
        { text: `${litersValue.toFixed(2)}L`, align: 'center' },
        { text: `R$ ${pricePerLiterValue.toFixed(2)}`, align: 'right' },
        { text: `R$ ${subtotalValue.toFixed(2)}`, align: 'right' },
        { text: `R$ ${serviceFeeValue.toFixed(2)}`, align: 'right' },
        { text: `R$ ${totalValue.toFixed(2)}`, align: 'right' }
      ];

      rowData.forEach((data, i) => {
        doc.fillColor(CORES.tintaEscura).fontSize(8).text(data.text, xPos + 5, rowY + 5, { 
          width: colWidths[i] - 10, 
          align: data.align as any
        });
        xPos += colWidths[i];
      });

      // Linha separadora
      doc.moveTo(40, rowY + 20).lineTo(doc.page.width - 40, rowY + 20).strokeColor(CORES.linha).lineWidth(0.5).stroke();
      doc.y = rowY + 22;

      // Observações (se houver)
      if (record.notes) {
        const notesY = doc.y;
        doc.fillColor('#fef3c7').rect(40, notesY, doc.page.width - 80, 20).fill();
        doc.fillColor('#78350f').fontSize(8).text(`Observações: ${record.notes}`, 45, notesY + 6, { 
          width: doc.page.width - 90 
        });
        doc.y = notesY + 22;
      }

      // Informações de Pesagem (se houver)
      if (record.weightFull) {
        const weightY = doc.y;
        doc.fillColor('#dbeafe').rect(40, weightY, doc.page.width - 80, 35).fill();
        
        const litersInitialValue = (record.litersInitial || 0) / 100;
        const weightFullValue = (record.weightFull || 0) / 100;
        const weightAfterValue = (record.weightAfter || 0) / 100;
        const weightConsumedValue = (record.weightConsumed || 0) / 100;
        const litersCalculatedValue = (record.litersCalculated || 0) / 100;
        
        doc.fillColor('#1e40af').fontSize(8).text(`Abastecimento por Pesagem`, 45, weightY + 6);
        doc.fillColor('#1e3a8a').fontSize(7).text(
          `Litros Iniciais: ${litersInitialValue.toFixed(2)}L  |  Peso Cheio: ${weightFullValue.toFixed(2)}kg  |  Peso Após: ${weightAfterValue.toFixed(2)}kg  |  Consumido: ${weightConsumedValue.toFixed(2)}kg`,
          45, weightY + 18
        );
        doc.fillColor('#1e3a8a').fontSize(7).text(
          `Litros Calculados: ${litersCalculatedValue.toFixed(2)}L`,
          45, weightY + 28
        );
        doc.y = weightY + 37;
      }
    });

    // Processar fotos de forma assíncrona antes de finalizar
    const processPhotos = async () => {
      const recordsWithPhotos = records.filter(r => r.photoBeforeUrl || r.photoAfterUrl);
      if (recordsWithPhotos.length === 0) return;
      
      console.log(`[PDF] Encontrados ${recordsWithPhotos.length} registros com fotos`);
      doc.addPage({ size: 'A4', layout: 'portrait', margin: 40 });
      doc.fontSize(16).fillColor(CORES.marca).text('Comprovação por Fotos da Balança', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor(CORES.cinza).text('Fotos das pesagens realizadas', { align: 'center' });
      doc.moveDown(1);

      // Configurações de layout
      const pageWidth = doc.page.width - 80; // Largura útil (descontando margens)
      const photoWidth = pageWidth / 2 - 10; // 2 fotos por linha com espaçamento
      const photoHeight = photoWidth * 0.75; // Proporção 4:3 (altura = 75% da largura)
      const maxPhotosPerPage = 4; // 2 linhas × 2 colunas = 4 fotos por página
      let photosOnCurrentPage = 0;

      // Processar fotos de forma assíncrona
      for (let index = 0; index < recordsWithPhotos.length; index++) {
        const record = recordsWithPhotos[index];
        
        // Baixar fotos primeiro
        let beforeBuffer: Buffer | null = null;
        let afterBuffer: Buffer | null = null;
        
        try {
          console.log(`[PDF] Processando fotos do registro #${record.id}`);
          console.log(`[PDF] photoBeforeUrl: ${record.photoBeforeUrl}`);
          console.log(`[PDF] photoAfterUrl: ${record.photoAfterUrl}`);
          
          if (record.photoBeforeUrl) {
            console.log(`[PDF] Baixando foto ANTES...`);
            beforeBuffer = (await baixarImagemExterna(record.photoBeforeUrl)).bytes;
            console.log(`[PDF] ✅ Foto ANTES baixada: ${beforeBuffer.length} bytes`);
          }
          if (record.photoAfterUrl) {
            console.log(`[PDF] Baixando foto DEPOIS...`);
            afterBuffer = (await baixarImagemExterna(record.photoAfterUrl)).bytes;
            console.log(`[PDF] ✅ Foto DEPOIS baixada: ${afterBuffer.length} bytes`);
          }
        } catch (error) {
          console.error(`[PDF] ❌ Erro ao baixar fotos do registro #${record.id}:`, error);
          console.error(`[PDF] Detalhes do erro:`, error instanceof Error ? error.message : error);
        }

        // Contar quantas fotos temos neste registro
        const photosInRecord = (beforeBuffer ? 1 : 0) + (afterBuffer ? 1 : 0);
        
        // Verificar se precisa de nova página
        if (photosOnCurrentPage + photosInRecord > maxPhotosPerPage) {
          doc.addPage({ size: 'A4', layout: 'portrait', margin: 40 });
          doc.y = 40;
          photosOnCurrentPage = 0;
        }

        // Título do registro (sempre no topo da seção)
        const titleY = doc.y;
        doc.fillColor(CORES.marca).fontSize(9).text(
          `Registro #${record.id} - ${record.vesselName.normalize('NFC')} - ${new Date(record.date).toLocaleDateString('pt-BR')}`,
          40, titleY,
          { width: pageWidth, align: 'left' }
        );
        doc.moveDown(0.5);

        // Adicionar fotos lado a lado
        const rowY = doc.y;
        let currentX = 40;

        if (beforeBuffer) {
          // Verificar se cabe na página atual
          if (doc.y + photoHeight + 30 > doc.page.height - 40) {
            doc.addPage({ size: 'A4', layout: 'portrait', margin: 40 });
            doc.y = 40;
            photosOnCurrentPage = 0;
            currentX = 40;
          }

          // Label da foto
          doc.fillColor(CORES.rotulo).fontSize(8).text('Foto ANTES (peso cheio)', currentX, doc.y, { width: photoWidth, align: 'center' });
          const labelHeight = 15;
          
          // Imagem
          doc.image(beforeBuffer, currentX, doc.y + labelHeight, { 
            width: photoWidth, 
            height: photoHeight,
            fit: [photoWidth, photoHeight],
            align: 'center'
          });
          
          currentX += photoWidth + 20; // Próxima coluna
          photosOnCurrentPage++;
        }

        if (afterBuffer) {
          // Verificar se cabe na mesma linha ou precisa de nova linha
          if (currentX > 40 + photoWidth) {
            // Mesma linha (lado a lado)
            doc.fillColor(CORES.rotulo).fontSize(8).text('Foto DEPOIS (peso após)', currentX, rowY, { width: photoWidth, align: 'center' });
            const labelHeight = 15;
            doc.image(afterBuffer, currentX, rowY + labelHeight, { 
              width: photoWidth, 
              height: photoHeight,
              fit: [photoWidth, photoHeight],
              align: 'center'
            });
            photosOnCurrentPage++;
          } else {
            // Nova linha (foto ANTES não existe)
            if (doc.y + photoHeight + 30 > doc.page.height - 40) {
              doc.addPage({ size: 'A4', layout: 'portrait', margin: 40 });
              doc.y = 40;
              photosOnCurrentPage = 0;
            }
            doc.fillColor(CORES.rotulo).fontSize(8).text('Foto DEPOIS (peso após)', 40, doc.y, { width: photoWidth, align: 'center' });
            const labelHeight = 15;
            doc.image(afterBuffer, 40, doc.y + labelHeight, { 
              width: photoWidth, 
              height: photoHeight,
              fit: [photoWidth, photoHeight],
              align: 'center'
            });
            photosOnCurrentPage++;
          }
        }

        // Avançar para próxima linha
        doc.y = rowY + photoHeight + 30;

        // Linha separadora entre registros
        if (index < recordsWithPhotos.length - 1) {
          doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor(CORES.linha).lineWidth(1).stroke();
          doc.moveDown(0.5);
        }
      }
    };

    // Executar processamento assíncrono de fotos
    processPhotos().then(() => {
      console.log('[PDF] ✅ Todas as fotos processadas, finalizando documento...');
      
      // Rodapé
    doc.moveDown(2);
    const footerY = doc.y;
    doc.moveTo(40, footerY).lineTo(doc.page.width - 40, footerY).strokeColor(CORES.linha).lineWidth(1).stroke();
    doc.moveDown(0.5);
    
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      doc.fillColor(CORES.cinza).fontSize(8).text(`Relatório gerado automaticamente em ${now}`, { align: 'center' });
      doc.fontSize(8).text(`© ${new Date().getFullYear()} Exclusive Club - Todos os direitos reservados`, { align: 'center' });

      doc.end();
    }).catch((error) => {
      console.error('[PDF] ❌ Erro ao processar fotos:', error);
      reject(error);
    });
  });
}
