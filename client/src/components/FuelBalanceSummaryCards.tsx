import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FuelBalanceSummaryCardsProps {
  balanceData?: {
    inherited?: number;
    budget?: number;
    spent?: number;
    current?: number;
  };
}

export function FuelBalanceSummaryCards({ balanceData }: FuelBalanceSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Saldo Herdado</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`text-2xl font-bold ${
            balanceData && balanceData.inherited! < 0
              ? 'text-red-600'
              : 'text-blue-600'
          }`}>
            R$ {balanceData?.inherited?.toFixed(2) || "0.00"}
          </p>
          <p className="text-xs text-muted-foreground">Do mês anterior</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Orçamento</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">R$ {balanceData?.budget?.toFixed(2) || "0.00"}</p>
          <p className="text-xs text-muted-foreground">Compras do mês</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Gasto</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-orange-600">R$ {balanceData?.spent?.toFixed(2) || "0.00"}</p>
          <p className="text-xs text-muted-foreground">Abastecimentos</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Saldo Atual</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`text-2xl font-bold ${
            balanceData && balanceData.current! < 0
              ? 'text-red-600'
              : 'text-green-600'
          }`}>
            R$ {balanceData?.current?.toFixed(2) || "0.00"}
          </p>
          <p className="text-xs text-muted-foreground">Herdado + Gasto - Orçamento</p>
        </CardContent>
      </Card>
    </div>
  );
}
