/**
 * Dados de exemplo dos PDFs, fixos e sem nada de real.
 *
 * Ficam num arquivo separado porque servem a dois donos: a trava de regressão
 * (`pdfGolden.test.ts`) e qualquer conferência manual futura. Se a amostra
 * mudar, o documento de referência muda junto — e é exatamente isso que a trava
 * precisa detectar.
 *
 * As amostras exercitam de propósito o que costuma quebrar em mudança de
 * layout: acentuação, texto longo que precisa quebrar linha, valor alto que
 * alarga coluna, campo opcional vazio e mais de uma linha na tabela.
 *
 * NENHUM dado aqui é de cliente real, e nenhuma URL aponta para fora — assim
 * a geração não depende de rede e o resultado é sempre o mesmo.
 */

export const CLIENTE_EXEMPLO = {
  name: "Ana Carolina de Souza Gonçalves",
  email: "ana.goncalves@exemplo.com.br",
  phone: "(11) 98765-4321",
  quotas: [
    { vesselName: "Lancha Ventura 275", quotaNumber: 3, quotaType: "integral" },
    { vesselName: "Jet Ski Sea-Doo GTX", quotaNumber: 12, quotaType: "compartilhada" },
  ],
};

export const ABASTECIMENTOS_EXEMPLO = [
  {
    id: 101,
    vesselName: "Lancha Ventura 275",
    clientName: "Ana Carolina de Souza Gonçalves",
    employeeName: "José Ribamar",
    date: "2026-03-15T13:00:00.000Z",
    liters: 12550, // centavos
    pricePerLiter: 689,
    subtotal: 8646950,
    serviceFee: 150000,
    totalAmount: 8796950,
    notes: "Abastecimento com o barco já na água; conferido pelo responsável do píer.",
    litersInitial: 3000,
    weightFull: 25000,
    weightAfter: 12450,
    weightConsumed: 12550,
    litersCalculated: 12550,
    photoBeforeUrl: null,
    photoAfterUrl: null,
  },
  {
    id: 102,
    vesselName: "Jet Ski Sea-Doo GTX",
    clientName: "Marcos Antônio Nóbrega",
    employeeName: undefined,
    date: "2026-03-16T13:00:00.000Z",
    liters: 4000,
    pricePerLiter: 712,
    subtotal: 2848000,
    serviceFee: 0,
    totalAmount: 2848000,
    notes: undefined,
    litersInitial: null,
    weightFull: null,
    weightAfter: null,
    weightConsumed: null,
    litersCalculated: null,
    photoBeforeUrl: null,
    photoAfterUrl: null,
  },
];

export const VISTORIAS_EXEMPLO = [
  {
    id: 201,
    vessel_name: "Lancha Ventura 275",
    vessel_type: "boat",
    booking_client_name: "Ana Carolina de Souza Gonçalves",
    booking_date: "2026-03-15T13:00:00.000Z",
    inspected_by: "José Ribamar",
    observations: "Casco sem avarias. Colete salva-vidas número 4 com fivela folgada — substituído no ato.",
    inspection_data: { casco: "ok", coletes: "reprovado", motor: "ok" },
    reprovation_photos: null,
  },
  {
    id: 202,
    vessel_name: "Jet Ski Sea-Doo GTX",
    vessel_type: "jet",
    booking_client_name: "Marcos Antônio Nóbrega",
    booking_date: "2026-03-16T13:00:00.000Z",
    inspected_by: "José Ribamar",
    observations: "",
    inspection_data: { casco: "ok", motor: "ok" },
    reprovation_photos: null,
  },
];

export const NOTIFICACAO_EXEMPLO = {
  clientName: "Ana Carolina de Souza Gonçalves",
  clientCpfCnpj: "123.456.789-00",
  clientEmail: "ana.goncalves@exemplo.com.br",
  debts: [
    {
      description: "Mensalidade de fevereiro/2026 — cota integral Lancha Ventura 275",
      dueDate: "2026-02-10",
      value: 2450.9,
      daysOverdue: 33,
      type: "monthly",
    },
    {
      description: "Vistoria de devolução",
      dueDate: "2026-02-28",
      value: 180,
      daysOverdue: 15,
      type: "inspection",
    },
  ],
  totalDebt: 2630.9,
  notificationDate: "2026-03-15",
};

export const CONTRATO_EXEMPLO = {
  clientName: "Ana Carolina de Souza Gonçalves",
  clientCpfCnpj: "123.456.789-00",
  clientRg: "12.345.678-9",
  clientPhone: "(11) 98765-4321",
  clientEmail: "ana.goncalves@exemplo.com.br",
  clientAddress: "Rua das Palmeiras, 1024, apto 71",
  clientNeighborhood: "Jardim Paulista",
  clientCity: "São Paulo",
  clientState: "SP",
  clientZipCode: "01415-002",
  quotas: [
    {
      boatName: "Lancha Ventura 275",
      boatDescription: "Lancha de 27 pés, capacidade para 12 pessoas",
      quotaType: "integral",
      quotaNumber: 3,
      totalQuotas: 8,
      adhesionValue: 45000,
      monthlyFee: 2450.9,
      quotaPercentage: "12,5%",
      capacity: 12,
    },
  ],
  installments: [
    { description: "Entrada", dueDate: "2026-03-20", value: 15000, status: "pending" },
    { description: "Parcela 1 de 2", dueDate: "2026-04-20", value: 15000 },
    { description: "Parcela 2 de 2", dueDate: "2026-05-20", value: 15000 },
  ],
  contractDate: "2026-03-15",
};
