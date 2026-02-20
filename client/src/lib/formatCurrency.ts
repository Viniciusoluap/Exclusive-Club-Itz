/**
 * Formata valor numérico para o padrão monetário brasileiro
 * @param value - Valor numérico a ser formatado
 * @returns String formatada no padrão R$ 10.000,00
 * @example
 * formatCurrency(10000) // "R$ 10.000,00"
 * formatCurrency(1234.56) // "R$ 1.234,56"
 * formatCurrency(0) // "R$ 0,00"
 */
export function formatCurrency(value: number | string | null | undefined): string {
  // Converter para número se for string
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  // Retornar R$ 0,00 se valor for inválido
  if (numValue === null || numValue === undefined || isNaN(numValue)) {
    return 'R$ 0,00';
  }
  
  // Formatar usando Intl.NumberFormat para padrão brasileiro
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numValue);
}
