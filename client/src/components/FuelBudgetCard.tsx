import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Fuel, Settings } from "lucide-react";

interface FuelBudgetCardProps {
  selectedYear: number;
  selectedMonth: number;
  totalCobrado: number;
  budgetAmount: number;
  budgetUsedPercent: number;
  totalStock: number;
  avgPricePerLiter: number;
  operationalCost?: number;
  operationalCostYear?: string;
  onConfigure: () => void;
}

export function FuelBudgetCard({
  selectedYear,
  selectedMonth,
  totalCobrado,
  budgetAmount,
  budgetUsedPercent,
  totalStock,
  avgPricePerLiter,
  operationalCost,
  operationalCostYear,
  onConfigure,
}: FuelBudgetCardProps) {
  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Orçamento Mensal</CardTitle>
            <CardDescription>
              {new Date(selectedYear, selectedMonth - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onConfigure}>
            <Settings className="w-4 h-4 mr-2" />
            Configurar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm">Gasto: R$ {totalCobrado.toFixed(2)}</span>
          <span className="text-sm">Orçamento: R$ {budgetAmount.toFixed(2)}</span>
        </div>
        <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
          <div
            className={`h-full transition-all ${budgetUsedPercent > 90 ? 'bg-red-500' : budgetUsedPercent > 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
            style={{ width: `${budgetUsedPercent}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">{budgetUsedPercent.toFixed(1)}% utilizado</p>

        <div className="mt-4 pt-4 border-t flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Fuel className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium">Estoque:</span>
          </div>
          <div className="text-right">
            <p className="font-bold">{totalStock.toFixed(2)} L</p>
            <p className="text-xs text-muted-foreground">Preço/L atual: R$ {avgPricePerLiter.toFixed(2)}</p>
          </div>
        </div>

        {(operationalCost ?? 0) > 0 && (
          <div className="mt-3 pt-3 border-t flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-orange-600" />
              <span className="text-sm font-medium">Custo Operacional ({operationalCostYear}):</span>
            </div>
            <p className="font-bold text-orange-600">R$ {operationalCost?.toFixed(2)}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
