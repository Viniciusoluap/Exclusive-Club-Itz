import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  const trpcAny = trpc as any;
  const utils = trpc.useUtils();
  
  // Buscar dados do orçamento e compras
  const { data: budget, refetch: refetchBudget } = trpcAny.fuelBudget?.get.useQuery({ monthYear }) || { data: null };
  const { data: purchases, refetch: refetchPurchases } = trpcAny.fuelPurchases?.list.useQuery({ monthYear }) || { data: [] };

  // useEffect removido - orçamento agora é calculado automaticamente

  // Mutations (setBudgetMutation removido - orçamento agora é calculado automaticamente)

  const createPurchaseMutation = trpcAny.fuelPurchases?.create.useMutation({
    onSuccess: () => {
      toast.success('Compra de gasolina registrada com sucesso!');
      setPurchaseLiters("");
      setPurchaseAmount("");
      setPurchaseNotes("");
      refetchBudget();
      refetchPurchases();
    },
    onError: (error: any) => {
      toast.error(`Erro ao registrar compra: ${error.message}`);
    },
  });

  const deletePurchaseMutation = trpcAny.fuelPurchases?.delete.useMutation({
    onSuccess: () => {
      toast.success('Compra excluída com sucesso!');
      refetchBudget();
      refetchPurchases();
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
    });
  };

  const handleDeletePurchase = (purchaseId: number) => {
    if (confirm('Tem certeza que deseja excluir esta compra? Os litros serão devolvidos ao estoque.')) {
      deletePurchaseMutation.mutate({ purchaseId });
    }
  };

  // Calcular preço por litro da compra
  const pricePerLiter = purchaseLiters && purchaseAmount
    ? (parseFloat(purchaseAmount) / parseFloat(purchaseLiters)).toFixed(2)
    : "0.00";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gestão de Combustível</DialogTitle>
          <DialogDescription>
            Configure orçamento e registre compras de gasolina para {new Date(monthYear + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Card de Resumo */}
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Orçamento Mensal</p>
                  <p className="text-2xl font-bold">R$ {budget?.totalBudget?.toFixed(2) || "0.00"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Estoque Disponível</p>
                  <p className="text-2xl font-bold text-green-600">{budget?.stockLiters?.toFixed(2) || "0.00"} L</p>
                  {budget?.stockLiters && budget.stockLiters < 5 && (
                    <div className="flex items-center gap-1 text-xs text-red-600 mt-1">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Estoque baixo!</span>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Preço/L Atual</p>
                  <p className="text-2xl font-bold text-blue-600">R$ {budget?.lastPricePerLiter?.toFixed(2) || "0.00"}</p>
                  <p className="text-xs text-muted-foreground mt-1">Aplicado automaticamente</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Seção de Orçamento REMOVIDA - agora é calculado automaticamente como soma das compras */}

          {/* Registrar Compra de Gasolina */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Registrar Compra de Gasolina</CardTitle>
              <CardDescription>Adicione litros ao estoque e atualize o preço/L automaticamente</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                    Este preço será aplicado automaticamente nos próximos abastecimentos
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
                Registrar Compra
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
              {!purchases || purchases.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma compra registrada neste mês
                </p>
              ) : (
                <div className="space-y-3">
                  {purchases.slice(0, 5).map((purchase: any) => (
                    <div key={purchase.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
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
