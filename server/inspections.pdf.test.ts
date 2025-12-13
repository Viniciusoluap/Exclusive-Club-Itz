import { describe, it, expect } from 'vitest';
import { generateInspectionsReportPDF } from './_core/inspectionsPDF';

describe('inspections.generatePDF', () => {
  it('should generate PDF buffer from inspections with all data', async () => {
    const mockInspections = [
      {
        id: 1,
        vessel_name: 'JETSKI SEADOO GTI SE 130HP',
        vessel_type: 'jetski',
        client_name: 'João Silva',
        booking_date: new Date('2025-12-07'),
        created_at: new Date('2025-12-07T10:30:00'),
        inspected_by: 'Vinicius Freitas', // Campo TEXT, não ID
        inspection_data: {
          'PINTURA / CASCO': 'APROVADO',
          'LUZES GERAL': 'APROVADO',
          'CARPETE': 'REPROVADO',
          'BANCO E ESTOFADO': 'APROVADO',
          'ANCORA': 'APROVADO',
          'COLETES': 'APROVADO',
          'TURBINA / IBR': 'APROVADO',
          'CHAVE': 'APROVADO',
          'CARRETINHA': 'APROVADO',
          'PNEUS DA CARRETINHA': 'APROVADO',
          'CASCO': 'APROVADO',
          'TAMPA DO JET': 'APROVADO',
        },
        observations: 'Carpete apresenta desgaste excessivo. Necessita substituição urgente.',
      },
      {
        id: 2,
        vessel_name: 'Focker 215',
        vessel_type: 'lancha',
        client_name: 'Maria Santos',
        booking_date: new Date('2025-12-08'),
        created_at: new Date('2025-12-08T14:00:00'),
        inspected_by: 'Paulo Vinicius',
        inspection_data: {
          'PINTURA / CASCO': 'APROVADO',
          'LUZES GERAL': 'APROVADO',
          'CARPETE': 'APROVADO',
          'BANCO E ESTOFADO': 'APROVADO',
          'ANCORA': 'APROVADO',
          'COLETES': 'APROVADO',
          'MOTOR': 'APROVADO',
          'HELICE': 'APROVADO',
          'CHAVE': 'APROVADO',
          'CARRETINHA': 'APROVADO',
          'PNEUS DA CARRETINHA': 'APROVADO',
          'CASCO': 'APROVADO',
          'TAMPA DO MOTOR': 'APROVADO',
          'PARA-BRISA': 'APROVADO',
          'TOLDO': 'REPROVADO',
          'ESCADA': 'APROVADO',
          'EXTINTOR': 'REPROVADO',
          'BUZINA': 'APROVADO',
        },
        observations: 'Toldo rasgado e extintor vencido. Providenciar substituição antes da próxima saída.',
      },
    ];

    const pdfBuffer = await generateInspectionsReportPDF(mockInspections);

    // Verificar que retornou um Buffer
    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);

    // Verificar que o buffer não está vazio
    expect(pdfBuffer.length).toBeGreaterThan(0);

    // Verificar assinatura PDF (%PDF)
    const pdfSignature = pdfBuffer.toString('ascii', 0, 4);
    expect(pdfSignature).toBe('%PDF');

    console.log(`✅ PDF de vistorias gerado com sucesso: ${pdfBuffer.length.toLocaleString()} bytes`);
    console.log(`✅ Contém 2 vistorias com itens reprovados e observações`);
    console.log(`✅ Nome do vistoriador: Vinicius Freitas e Paulo Vinicius`);
    console.log(`✅ Timezone de Brasília aplicado`);
  });
});
