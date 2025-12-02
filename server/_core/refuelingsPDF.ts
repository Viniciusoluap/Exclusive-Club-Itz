import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export async function generateRefuelingsReportPDF(refuelings: any[]): Promise<Buffer> {
  const doc = new jsPDF();
  
  // Título
  doc.setFontSize(18);
  doc.text('Relatório de Abastecimentos', 14, 20);
  
  // Data de geração
  doc.setFontSize(10);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 28);
  doc.text(`Total de abastecimentos: ${refuelings.length}`, 14, 34);
  
  // Calcular totais
  const totalLiters = refuelings.reduce((sum, r) => sum + Number(r.liters || 0), 0);
  const totalCost = refuelings.reduce((sum, r) => sum + Number(r.total_cost || 0), 0);
  
  doc.text(`Total de litros: ${totalLiters.toFixed(2)}L`, 14, 40);
  doc.text(`Custo total: R$ ${totalCost.toFixed(2)}`, 14, 46);
  
  // Tabela de abastecimentos
  const tableData = refuelings.map((refuel, index) => {
    return [
      index + 1,
      refuel.vessel_name || 'N/A',
      refuel.client_name || 'N/A',
      new Date(refuel.booking_date || refuel.date).toLocaleDateString('pt-BR'),
      `${Number(refuel.liters || 0).toFixed(2)}L`,
      `R$ ${Number(refuel.price_per_liter || 0).toFixed(2)}`,
      `R$ ${Number(refuel.total_cost || 0).toFixed(2)}`,
      refuel.recorded_by_name || 'N/A',
    ];
  });
  
  autoTable(doc, {
    startY: 52,
    head: [['#', 'Embarcação', 'Cliente', 'Data', 'Litros', 'R$/L', 'Total', 'Registrado por']],
    body: tableData,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [41, 128, 185] },
    foot: [[
      '',
      '',
      '',
      'TOTAL:',
      `${totalLiters.toFixed(2)}L`,
      '',
      `R$ ${totalCost.toFixed(2)}`,
      ''
    ]],
    footStyles: { fillColor: [240, 240, 240], fontStyle: 'bold' },
  });
  
  // Converter para Buffer
  const pdfOutput = doc.output('arraybuffer');
  return Buffer.from(pdfOutput);
}
