import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Banknote } from "lucide-react";

interface FuelBpoStatsCardProps {
  bpoFuelStats: {
    totalExpected: number;
    totalPaid: number;
    totalPending: number;
    totalOverdue: number;
    totalCount: number;
  };
  selectedYear: number;
}

export function FuelBpoStatsCard({ bpoFuelStats, selectedYear }: FuelBpoStatsCardProps) {
  return (
    <Card className="mb-6 border-blue-200 bg-blue-50/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Banknote className="w-4 h-4 text-blue-600" />
          Cobranças BPO — Abastecimentos ({selectedYear})
        </CardTitle>
        <p className="text-xs text-muted-foreground">Dados financeiros centralizados de bpo_charges</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="text-center p-2 bg-white rounded-lg border">
            <p className="text-xs text-muted-foreground">Total Cobrado</p>
            <p className="font-bold text-sm">R$ {bpoFuelStats.totalExpected.toFixed(2)}</p>
          </div>
          <div className="text-center p-2 bg-white rounded-lg border">
            <p className="text-xs text-muted-foreground">Recebido</p>
            <p className="font-bold text-sm text-green-600">R$ {bpoFuelStats.totalPaid.toFixed(2)}</p>
          </div>
          <div className="text-center p-2 bg-white rounded-lg border">
            <p className="text-xs text-muted-foreground">Pendente</p>
            <p className="font-bold text-sm text-yellow-600">R$ {bpoFuelStats.totalPending.toFixed(2)}</p>
          </div>
          <div className="text-center p-2 bg-white rounded-lg border">
            <p className="text-xs text-muted-foreground">Vencido</p>
            <p className="font-bold text-sm text-red-600">R$ {bpoFuelStats.totalOverdue.toFixed(2)}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">{bpoFuelStats.totalCount} cobranças registradas no BPO</p>
      </CardContent>
    </Card>
  );
}
