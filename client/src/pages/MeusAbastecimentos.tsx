import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Fuel, ExternalLink, FileText, DollarSign, TrendingUp, Loader2, AlertCircle, ArrowLeft } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Link, useLocation } from "wouter";

export default function MeusAbastecimentos() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);

  const trpcAny = trpc as any;
  const { data: myRecords, isLoading, refetch } = trpcAny.fuelRecords?.myRecords.useQuery(undefined, {
    enabled: !!user,
  }) || { data: [], isLoading: false };

  if (authLoading || isLoading) {
    return (
      <div className="container py-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container py-8">
        <Card>
          <CardContent className="py-8 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">Faça login para ver seus abastecimentos</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Calcular totais
  const totalPending = myRecords?.filter((r: any) => r.paymentStatus === 'pending' || r.paymentStatus === 'overdue')
    .reduce((sum: number, r: any) => sum + r.totalAmount, 0) || 0;
  
  const totalPaid = myRecords?.filter((r: any) => r.paymentStatus === 'paid')
    .reduce((sum: number, r: any) => sum + r.totalAmount, 0) || 0;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">✓ Pago</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">⏳ Pendente</Badge>;
      case 'overdue':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">⚠ Vencido</Badge>;
      case 'cancelled':
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">✕ Cancelado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">

      {/* Header com botão Voltar */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation('/dashboard')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-bold">Meus Abastecimentos</h1>
        <p className="text-muted-foreground mt-1">
          Acompanhe seus abastecimentos e pagamentos
        </p>
      </div>

      {/* Cards de Resumo */}
      <div className="grid gap-4 md:grid-cols-2 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total a Pagar</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">R$ {totalPending.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              Pagamentos pendentes e vencidos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pago</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">R$ {totalPaid.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              Pagamentos confirmados
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Abastecimentos */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Histórico</h2>
        
        {!myRecords || myRecords.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhum abastecimento encontrado
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {myRecords.map((record: any) => (
              <Card key={record.id}>
                <CardHeader className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <Fuel className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base sm:text-lg">{record.vesselName}</CardTitle>
                        <CardDescription className="text-xs sm:text-sm">
                          {new Date(record.bookingDate).toLocaleDateString('pt-BR')} • 
                          {new Date(record.createdAt).toLocaleString('pt-BR')}
                        </CardDescription>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between sm:items-start gap-3 sm:gap-4">
                      <div className="text-left sm:text-right flex-1">
                        <div className="text-xl sm:text-2xl font-bold text-primary">
                          R$ {record.totalAmount.toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                          <div>{record.liters.toFixed(1)}L × R$ {record.pricePerLiter.toFixed(2)}</div>
                          <div>= R$ {(record.liters * record.pricePerLiter).toFixed(2)}</div>
                          <div>Taxa: R$ 10,00</div>
                        </div>
                        <div className="mt-2">
                          {getStatusBadge(record.paymentStatus)}
                        </div>
                        {record.dueDate && record.paymentStatus !== 'paid' && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Vencimento: {new Date(record.dueDate).toLocaleDateString('pt-BR')}
                          </div>
                        )}
                        {record.paidAt && (
                          <div className="text-xs text-green-600 mt-1">
                            Pago em: {new Date(record.paidAt).toLocaleDateString('pt-BR')}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        {/* Botão Pagar (se pendente/vencido e tiver asaas_charge_id) */}
                        {(record.paymentStatus === 'pending' || record.paymentStatus === 'overdue') && record.asaasChargeId && (
                          <Button
                            onClick={() => {
                              const asaasUrl = `https://www.asaas.com/c/${record.asaasChargeId}`;
                              window.open(asaasUrl, '_blank');
                            }}
                            className="whitespace-nowrap"
                          >
                            <DollarSign className="w-4 h-4 mr-1" />
                            Pagar
                          </Button>
                        )}
                        
                        {/* Botão Ver Comprovante */}
                        {record.receiptUrl && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedReceipt(record.receiptUrl)}
                            className="whitespace-nowrap"
                          >
                            <FileText className="w-3 h-3 mr-1" />
                            Ver Comprovante
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                {record.notes && (
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground">
                      <strong>Observações:</strong> {record.notes}
                    </p>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Dialog de Visualização de Comprovante */}
      <Dialog open={!!selectedReceipt} onOpenChange={() => setSelectedReceipt(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Comprovante de Pagamento</DialogTitle>
            <DialogDescription>
              Comprovante anexado ao abastecimento
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {selectedReceipt && (
              <div className="space-y-4">
                {selectedReceipt.endsWith('.pdf') ? (
                  <div className="text-center">
                    <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mb-4">
                      Arquivo PDF
                    </p>
                    <Button
                      onClick={() => window.open(selectedReceipt, '_blank')}
                      variant="outline"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Abrir PDF
                    </Button>
                  </div>
                ) : (
                  <img 
                    src={selectedReceipt} 
                    alt="Comprovante" 
                    className="w-full rounded-lg"
                  />
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
