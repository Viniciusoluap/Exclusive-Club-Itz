import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import axios from 'axios';
import { assertSafeExternalUrl } from './urlSafety';

export async function generateInspectionsReportPDF(inspections: any[]): Promise<Buffer> {
  const doc = new jsPDF();
  
  // Título
  doc.setFontSize(18);
  doc.text('Relatório de Vistorias', 14, 20);
  
  // Data de geração com timezone de Brasília
  doc.setFontSize(10);
  const generatedAt = new Date().toLocaleString('pt-BR', { 
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short'
  });
  doc.text(`Gerado em: ${generatedAt}`, 14, 28);
  doc.text(`Total de vistorias: ${inspections.length}`, 14, 34);
  
  // Tabela de vistorias
  const tableData = inspections.map((insp, index) => {
    // Tratar formData que pode ser null/undefined
    const formData = insp.inspection_data || insp.form_data || {};
    const formDataObj = typeof formData === 'string' ? JSON.parse(formData) : formData;
    
    const approvedCount = Object.values(formDataObj).filter((v: any) => v === 'APROVADO' || v === 'approved').length;
    const totalFields = Object.keys(formDataObj).length;
    const status = totalFields === 0 ? 'Sem dados' : (approvedCount === totalFields ? 'Aprovado' : `${totalFields - approvedCount} reprovações`);
    
    // Nome do vistoriador vem do campo inspected_by (TEXT)
    const inspectorName = insp.inspected_by || insp.inspectedBy || 'N/A';
    
    return [
      index + 1,
      insp.vessel_name || 'N/A',
      insp.booking_client_name || insp.client_name || 'N/A',
      new Date(insp.booking_date || insp.inspection_date || insp.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      insp.vessel_type === 'jet' || insp.vessel_type === 'jetski' ? 'Jet Ski' : 'Lancha',
      status,
      inspectorName, // Agora vem do campo TEXT, não de JOIN com users
    ];
  });
  
  autoTable(doc, {
    startY: 40,
    head: [['#', 'Embarcação', 'Cliente', 'Data', 'Tipo', 'Status', 'Vistoriado por']],
    body: tableData,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [41, 128, 185] },
  });
  
  // Adicionar seção de observações e itens reprovados para cada vistoria
  let yPos = (doc as any).lastAutoTable.finalY + 10;
  
  for (let index = 0; index < inspections.length; index++) {
    const insp = inspections[index];
    const formData = insp.inspection_data || insp.form_data || {};
    const formDataObj = typeof formData === 'string' ? JSON.parse(formData) : formData;
    
    // Listar itens reprovados
    const rejectedItems = Object.entries(formDataObj)
      .filter(([_, status]) => status === 'REPROVADO' || status === 'rejected')
      .map(([field]) => field);
    
    // Observações
    const observations = insp.observations || insp.notes || '';
    
    // Só adiciona seção se houver itens reprovados OU observações
    if (rejectedItems.length > 0 || observations) {
      // Verificar se precisa de nova página
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }
      
      // Título da vistoria
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(`Vistoria #${index + 1} - ${insp.vessel_name}`, 14, yPos);
      yPos += 7;
      
      // Itens reprovados
      if (rejectedItems.length > 0) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(220, 38, 38); // Vermelho
        doc.text(`Itens Reprovados (${rejectedItems.length}):`, 14, yPos);
        yPos += 5;
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        
        // Parse fotos de reprovação
        let reprovationPhotos: Array<{itemName: string, photoUrl: string}> = [];
        try {
          if (insp.reprovation_photos && typeof insp.reprovation_photos === 'string') {
            reprovationPhotos = JSON.parse(insp.reprovation_photos);
          } else if (Array.isArray(insp.reprovation_photos)) {
            reprovationPhotos = insp.reprovation_photos;
          }
        } catch (e) {
          console.error('[PDF] Erro ao parsear reprovation_photos:', e);
        }
        
        for (const item of rejectedItems) {
          if (yPos > 280) {
            doc.addPage();
            yPos = 20;
          }
          doc.text(`• ${item}`, 18, yPos);
          yPos += 5;
          
          // Buscar foto do item reprovado
          const photo = reprovationPhotos.find(p => p.itemName === item);
          if (photo && photo.photoUrl) {
            try {
              // Download da imagem
              assertSafeExternalUrl(photo.photoUrl);
              const response = await axios.get(photo.photoUrl, { responseType: 'arraybuffer' });
              const imageBuffer = Buffer.from(response.data);
              const base64Image = imageBuffer.toString('base64');
              const mimeType = response.headers['content-type'] || 'image/jpeg';
              const imageData = `data:${mimeType};base64,${base64Image}`;
              
              // Verificar espaço para imagem (altura ~60mm)
              if (yPos > 220) {
                doc.addPage();
                yPos = 20;
              }
              
              // Adicionar imagem (largura 80mm, altura 60mm)
              doc.addImage(imageData, 'JPEG', 18, yPos, 80, 60);
              yPos += 65; // Espaço após imagem
            } catch (imgError: any) {
              console.error(`[PDF] Erro ao incorporar foto ${item}:`, imgError);
              doc.setFontSize(8);
              doc.setTextColor(100, 100, 100);
              doc.text(`  (Erro ao carregar foto)`, 22, yPos);
              yPos += 5;
              doc.setFontSize(9);
              doc.setTextColor(220, 38, 38);
            }
          }
        }
        yPos += 3;
      }
      
      // Observações
      if (observations) {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0, 0, 0); // Preto
        doc.text('Observações e Itens Reprovados:', 14, yPos);
        yPos += 5;
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        
        // Quebrar texto longo em múltiplas linhas
        const splitText = doc.splitTextToSize(observations, 180);
        splitText.forEach((line: string) => {
          if (yPos > 280) {
            doc.addPage();
            yPos = 20;
          }
          doc.text(line, 18, yPos);
          yPos += 5;
        });
      }
      
      yPos += 8; // Espaço entre vistorias
    }
  }
  
  // Converter para Buffer
  const pdfOutput = doc.output('arraybuffer');
  return Buffer.from(pdfOutput);
}
