// Tipos de cota pré-definidos disponíveis para venda
export const QUOTA_TYPES = [
  {
    id: "cota-inteira-1",
    name: "1 Cota Inteira",
    description: "Permite 2 reservas simultâneas",
    quotaType: "full" as const,
    quotaCount: 1,
  },
  {
    id: "cota-inteira-2",
    name: "2 Cotas Inteiras",
    description: "Permite 4 reservas simultâneas",
    quotaType: "full" as const,
    quotaCount: 2,
  },
  {
    id: "cota-inteira-3",
    name: "3 Cotas Inteiras",
    description: "Permite 6 reservas simultâneas",
    quotaType: "full" as const,
    quotaCount: 3,
  },
  {
    id: "meia-cota-1",
    name: "1 Meia Cota",
    description: "Permite 1 reserva por vez",
    quotaType: "half" as const,
    quotaCount: 1,
  },
  {
    id: "meia-cota-2",
    name: "2 Meias Cotas",
    description: "Permite 2 reservas simultâneas",
    quotaType: "half" as const,
    quotaCount: 2,
  },
  {
    id: "meia-cota-3",
    name: "3 Meias Cotas",
    description: "Permite 3 reservas simultâneas",
    quotaType: "half" as const,
    quotaCount: 3,
  },
] as const;

export type QuotaTypeId = typeof QUOTA_TYPES[number]["id"];
