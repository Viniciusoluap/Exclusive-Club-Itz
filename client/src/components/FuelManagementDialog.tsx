import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Plus, Trash2, Fuel, TrendingUp, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface FuelManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  monthYear: string;
}

export default function FuelManagementDialog({ open, onOpenChange, monthYear }: FuelManagementDialogProps) {
  // budgetAmount removido - orçamento agora é calculado automaticamente
  const [purchaseLiters, setPurchaseLiters] = useState("");
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [purchaseNotes, setPurchaseNotes] = useState("");
  const [selectedGallon, setSelectedGallon] = useState<string>("1");

  const utils = trpc.useUtils();

  // Buscar dados do orçamento e compras
  const { data: budget, refetch: refetchBudget } = trpc.fuelBudget.get.useQuery({ monthYear });
  const {
    data: purchases,
    isLoading: purchasesLoading,
    error: purchasesError,
    refetch: refetchPurchases,
  } = trpc.fuelPurchases.list.useQuery({ monthYear });
  const {
    data: gallonStock,
    isLoading: gallonStockLoading,
    error: gallonStockError,
    refetch: refetchGallonStock,
  } = trpc.fuelPurchases.getGallonStock.useQuery();

  // NOVO: Buscar estoque com herança do mês anterior
  const { data: stockWithInheritance, refetch: refetchStockInheritance } = trpc.fuelBudget.getCurrentStock.useQuery({ monthYear });

  // NOVO: Buscar saldo com herança do mês anterior
  const { data: balanceWithInheritance, refetch: refetchBalanceInheritance } = trpc.fuelBudget.getCurrentBalance.useQuery({ monthYear });

  // NOVO: Buscar apenas compras do mês (SEM herança) para exibir no card
  const {
    data: monthPurchases,
    isLoading: monthPurchasesLoading,
    error: monthPurchasesError,
    refetch: refetchMonthPurchases,
  } = trpc.fuelBudget.getMonthPurchases.useQuery({ monthYear });

  // useEffect removido - orçamento agora é calculado automaticamente

  // Mutations (setBudgetMutation removido - orçamento agora é calculado automaticamente)

  const createPurchaseMutation = trpc.fuelPurchases.create.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Compra de gasolina registrada no Galão ${data.gallonNumber} com sucesso!`);
      setPurchaseLiters("");
      setPurchaseAmount("");
      setPurchaseNotes("");
      refetchBudget();
      refetchPurchases();
      refetchGallonStock();
      refetchStockInheritance();
      refetchBalanceInheritance();
      refetchMonthPurchases();
    },
    onError: (error: any) => {
      toast.error(`Erro ao registrar compra: ${error.message}`);
    },
  });

  const deletePurchaseMutation = trpc.fuelPurchases.delete.useMutation({
    onSuccess: () => {
      toast.success('Compra excluída com sucesso!');
      refetchBudget();
      refetchPurchases();
      refetchGallonStock();
      refetchStockInheritance();
      refetchBalanceInheritance();
      refetchMonthPurchases();
    },
    onError: (error: any) => {
      toast.error(`Erro ao excluir compra: ${error.message}`);
    },
  });

  // handleSaveBudget removido - orçamento agora é calculado automaticamente

  const handleCreatePurchase = () => {
    const liters = parseFloat(purchaseLiters);
    const amount = parseFloat(purchaseAmount);
    
    if (!liters || liters <= 0) {
      toast.error('Informe a quantidade de litros');
      return;
    }
    if (!amount || amount <= 0) {
      toast.error('Informe o valor pago');
      return;
    }

    createPurchaseMutation.mutate({
      monthYear,
      liters,
      amountPaid: amount,
      notes: purchaseNotes || undefined,
      gallonNumber: parseInt(selectedGallon),
    });
  };

  const handleDeletePurchase = (purchaseId: number) => {
    if (confirm('Tem certeza que deseja excluir esta compra? Os litros serão devolvidos ao estoque do galão.')) {
      deletePurchaseMutation.mutate({ purchaseId });
    }
  };

  // Calcular preço por litro da compra
  const pricePerLiter = purchaseLiters && purchaseAmount
    ? (parseFloat(purchaseAmount) / parseFloat(purchaseLiters)).toFixed(2)
    : "0.00";

  // Calcular estoque total (soma dos 3 galões) - USANDO APENAS COMPRAS DO MÊS
  const totalStock = monthPurchases ? monthPurchases.total : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gestão de Combustível</DialogTitle>
          <DialogDescription>
            Configure orçamento e registre compras de gasolina para {(() => {
              const [year, month] = monthYear.split('-');
              const date = new Date(parseInt(year), parseInt(month) - 1, 1);
              return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
            })()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Card de Estoque por Galão */}
          <Card className="bg-primary/5 border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Fuel className="w-5 h-5" />
                Estoque por Galão
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {(gallonStockError || monthPurchasesError) ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="flex items-center justify-between gap-4">
                    <span>Não foi possível carregar o estoque de combustível.</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        refetchGallonStock();
                        refetchMonthPurchases();
                      }}
                    >
                      Tentar novamente
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : (gallonStockLoading || monthPurchasesLoading) ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Galões 1, 2 e 3 - USANDO APENAS COMPRAS DO MÊS */}
                {[1, 2, 3].map((gallonNum) => {
                  const gallon = gallonStock?.find((g: any) => g.gallonNumber === gallonNum);
                  // Usar apenas compras do mês (SEM herança)
                  const stockLiters = monthPurchases ? monthPurchases[`gallon${gallonNum}` as 'gallon1' | 'gallon2' | 'gallon3'] : 0;
                  const pricePerL = gallon?.lastPricePerLiter || 0;
                  const isLow = stockLiters > 0 && stockLiters < 5;
                  
                  return (
                    <div key={gallonNum} className={`p-3 rounded-lg border ${isLow ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}>
                      <p className="text-sm font-semibold text-muted-foreground">Galão {gallonNum}</p>
                      <p className={`text-2xl font-bold ${stockLiters > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                        {stockLiters.toFixed(2)} L
                      </p>
                      {pricePerL > 0 && (
                        <p className="text-xs text-muted-foreground">R$ {pricePerL.toFixed(2)}/L</p>
                      )}
                      {isLow && (
                        <div className="flex items-center gap-1 text-xs text-red-600 mt-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Estoque baixo!</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {/* Total */}
                <div className="p-3 rounded-lg border border-primary/30 bg-primary/10">
                  <p className="text-sm font-semibold text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold text-primary">{totalStock.toFixed(2)} L</p>
                  <p className="text-xs text-muted-foreground">Soma dos 3 galões</p>
                </div>
              </div>
              )}
            </CardContent>
          </Card>

          {/* Registrar Compra de Gasolina */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Registrar Compra de Gasolina</CardTitle>
              <CardDescription>Adicione litros ao estoque de um galão específico</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Seletor de Galão */}
              <div>
                <Label htmlFor="gallon">Selecione o Galão *</Label>
                <Select value={selectedGallon} onValueChange={setSelectedGallon}>
                  <SelectTrigger id="gallon" className="w-full">
                    <SelectValue placeholder="Selecione o galão" />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3].map((num) => {
                      const gallon = gallonStock?.find((g: any) => g.gallonNumber === num);
                      const stockLiters = gallon?.stockLiters || 0;
                      return (
                        <SelectItem key={num} value={num.toString()}>
                          Galão {num} - Estoque atual: {stockLiters.toFixed(2)} L
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="liters">Quantos Litros *</Label>
                  <Input
                    id="liters"
                    type="number"
                    step="0.01"
                    min="0"
                    value={purchaseLiters}
                    onChange={(e) => setPurchaseLiters(e.target.value)}
                    placeholder="Ex: 100.00"
                  />
                </div>
                <div>
                  <Label htmlFor="amount">Valor Pago (R$) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={purchaseAmount}
                    onChange={(e) => setPurchaseAmount(e.target.value)}
                    placeholder="Ex: 650.00"
                  />
                </div>
              </div>

              {/* Cálculo automático de preço/L */}
              {purchaseLiters && purchaseAmount && (
                <div className="bg-primary/10 p-3 rounded-lg">
                  <p className="text-sm font-semibold">💰 Preço por Litro Calculado:</p>
                  <p className="text-2xl font-bold text-primary">R$ {pricePerLiter}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Este preço será aplicado ao Galão {selectedGallon}
                  </p>
                </div>
              )}

              <div>
                <Label htmlFor="notes">Observações (opcional)</Label>
                <Textarea
                  id="notes"
                  value={purchaseNotes}
                  onChange={(e) => setPurchaseNotes(e.target.value)}
                  placeholder="Ex: Posto Shell, NF 12345"
                  rows={2}
                />
              </div>

              <Button 
                onClick={handleCreatePurchase}
                disabled={createPurchaseMutation.isPending || !purchaseLiters || !purchaseAmount}
                className="w-full"
              >
                {createPurchaseMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Plus className="w-4 h-4 mr-2" />
                Registrar Compra no Galão {selectedGallon}
              </Button>
            </CardContent>
          </Card>

          {/* Histórico de Compras */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Histórico de Compras</CardTitle>
              <CardDescription>Últimas compras de gasolina registradas</CardDescription>
            </CardHeader>
            <CardContent>
              {purchasesError ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="flex items-center justify-between gap-4">
                    <span>Não foi possível carregar o histórico de compras.</span>
                    <Button variant="outline" size="sm" onClick={() => refetchPurchases()}>
                      Tentar novamente
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : purchasesLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !purchases || purchases.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma compra registrada neste mês
                </p>
              ) : (
                <div className="space-y-3">
                  {purchases.slice(0, 10).map((purchase: any) => (
                    <div key={purchase.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="bg-primary/20 text-primary text-xs font-bold px-2 py-1 rounded">
                            Galão {purchase.gallonNumber || 1}
                          </span>
                          <Fuel className="w-4 h-4 text-primary" />
                          <span className="font-semibold">{purchase.litersPurchased.toFixed(2)} L</span>
                          <span className="text-muted-foreground">•</span>
                          <span className="font-semibold text-primary">R$ {purchase.amountPaid.toFixed(2)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Preço/L: R$ {purchase.pricePerLiter.toFixed(2)} • {new Date(purchase.purchasedAt).toLocaleDateString('pt-BR')} • {purchase.purchasedByName}
                        </div>
                        {purchase.notes && (
                          <div className="text-xs text-muted-foreground italic mt-1">
                            {purchase.notes}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeletePurchase(purchase.id)}
                        disabled={deletePurchaseMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
