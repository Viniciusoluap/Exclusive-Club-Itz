import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export async function generateInspectionsReportPDF(inspections: any[]): Promise<Buffer> {
  const doc = new jsPDF();
  
  // Título
  doc.setFontSize(18);
  doc.text('Relatório de Vistorias', 14, 20);
  
  // Data de geração
  doc.setFontSize(10);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 28);
  doc.text(`Total de vistorias: ${inspections.length}`, 14, 34);
  
  // Tabela de vistorias
  const tableData = inspections.map((insp, index) => {
    // Tratar formData que pode ser null/undefined
    const formData = insp.inspection_data || insp.form_data || {};
    const formDataObj = typeof formData === 'string' ? JSON.parse(formData) : formData;
    
    const approvedCount = Object.values(formDataObj).filter((v: any) => v === 'APROVADO' || v === 'approved').length;
    const totalFields = Object.keys(formDataObj).length;
    const status = totalFields === 0 ? 'Sem dados' : (approvedCount === totalFields ? 'Aprovado' : `${totalFields - approvedCount} reprovações`);
    
    return [
      index + 1,
      insp.vessel_name || 'N/A',
      insp.booking_client_name || insp.client_name || 'N/A',
      new Date(insp.booking_date || insp.inspection_date).toLocaleDateString('pt-BR'),
      insp.vessel_type === 'jet' ? 'Jet Ski' : 'Lancha',
      status,
      insp.inspected_by_name || 'N/A',
    ];
  });
  
  autoTable(doc, {
    startY: 40,
    head: [['#', 'Embarcação', 'Cliente', 'Data', 'Tipo', 'Status', 'Vistoriado por']],
    body: tableData,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [41, 128, 185] },
  });
  
  // Converter para Buffer
  const pdfOutput = doc.output('arraybuffer');
  return Buffer.from(pdfOutput);
}
