import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { ClipboardCheck, Copy, DollarSign, QrCode } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

export function InspectionChargesSection() {
  const [selectedCharges, setSelectedCharges] = useState<number[]>([]);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentData, setPaymentData] = useState<any>(null);
  const utils = trpc.useUtils();

  // Buscar cobranças do cliente
  const { data: charges, isLoading } = trpc.inspectionCharges.myCharges.useQuery({});
  const { data: stats } = trpc.inspectionCharges.getStats.useQuery();

  // Mutation para gerar pagamento PIX
  const generatePayment = trpc.inspectionCharges.generatePayment.useMutation({
    onSuccess: (data) => {
      setPaymentData(data);
      setShowPaymentDialog(true);
      toast.success("PIX gerado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao gerar pagamento");
    },
  });

  // Filtrar apenas cobranças pendentes/vencidas para seleção
  const pendingCharges = useMemo(() => {
    if (!charges) return [];
    return charges.filter(
      (c: any) => c.payment_status === "pending" || c.payment_status === "overdue"
    );
  }, [charges]);

  // Toggle seleção de cobrança
  const toggleCharge = (chargeId: number) => {
    setSelectedCharges((prev) =>
      prev.includes(chargeId) ? prev.filter((id) => id !== chargeId) : [...prev, chargeId]
    );
  };

  // Selecionar todos
  const toggleSelectAll = () => {
    if (selectedCharges.length === pendingCharges.length) {
      setSelectedCharges([]);
    } else {
      setSelectedCharges(pendingCharges.map((c: any) => c.id));
    }
  };

  // Gerar pagamento
  const handleGeneratePayment = () => {
    if (selectedCharges.length === 0) {
      toast.error("Selecione pelo menos uma cobrança");
      return;
    }
    generatePayment.mutate({ chargeIds: selectedCharges });
  };

  // Copiar código PIX
  const copyPixCode = () => {
    if (paymentData?.pixCopyPaste) {
      navigator.clipboard.writeText(paymentData.pixCopyPaste);
      toast.success("Código PIX copiado!");
    }
  };

  // Fechar dialog e limpar seleção
  const closePaymentDialog = () => {
    setShowPaymentDialog(false);
    setPaymentData(null);
    setSelectedCharges([]);
    utils.inspectionCharges.myCharges.invalidate();
    utils.inspectionCharges.getStats.invalidate();
  };

  // Badge de status
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
            Pendente
          </Badge>
        );
      case "overdue":
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
            Vencido
          </Badge>
        );
      case "paid":
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
            Pago
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Minhas Vistorias e Danos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!charges || charges.length === 0) {
    return (
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Minhas Vistorias e Danos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            Você não possui cobranças de danos registradas.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Minhas Vistorias e Danos
          </CardTitle>
          <CardDescription>
            Acompanhe vistorias reprovadas e realize pagamentos de reparos via PIX
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Cards de Resumo */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Vistorias Reprovadas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.totalCharges || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total em Danos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  R$ {((stats?.totalPending || 0) + (stats?.totalOverdue || 0)).toFixed(2)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Danos Pagos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  R$ {(stats?.totalPaid || 0).toFixed(2)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Pendente
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  R$ {(stats?.totalPending || 0).toFixed(2)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Botão de Pagamento */}
          {pendingCharges.length > 0 && (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedCharges.length === pendingCharges.length}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-sm font-medium">
                  {selectedCharges.length > 0
                    ? `${selectedCharges.length} selecionado(s)`
                    : "Selecionar todos"}
                </span>
              </div>
              <Button
                onClick={handleGeneratePayment}
                disabled={selectedCharges.length === 0 || generatePayment.isPending}
              >
                <DollarSign className="h-4 w-4 mr-2" />
                {generatePayment.isPending ? "Gerando PIX..." : "Pagar Selecionados"}
              </Button>
            </div>
          )}

          {/* Tabela de Cobranças */}
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="w-12 px-4 py-3"></th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">
                      Data
                    </th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">
                      Embarcação
                    </th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">
                      Itens Danificados
                    </th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">
                      Valor
                    </th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">
                      Vencimento
                    </th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-700">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {charges.map((charge: any) => {
                    const isPending =
                      charge.payment_status === "pending" ||
                      charge.payment_status === "overdue";
                    const failedItems = JSON.parse(charge.failed_items || "[]");

                    return (
                      <tr key={charge.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          {isPending && (
                            <Checkbox
                              checked={selectedCharges.includes(charge.id)}
                              onCheckedChange={() => toggleCharge(charge.id)}
                            />
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {new Date(charge.inspection_date).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium">{charge.vessel_name}</td>
                        <td className="px-4 py-3 text-sm">
                          <div className="max-w-xs">
                            {failedItems.slice(0, 2).map((item: any, idx: number) => (
                              <div key={idx} className="text-xs text-gray-600">
                                • {item.name}
                              </div>
                            ))}
                            {failedItems.length > 2 && (
                              <div className="text-xs text-gray-500">
                                +{failedItems.length - 2} mais
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold">
                          R$ {parseFloat(charge.amount).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {new Date(charge.due_date).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="px-4 py-3">{getStatusBadge(charge.payment_status)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dialog de Pagamento PIX */}
      <Dialog open={showPaymentDialog} onOpenChange={closePaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Pagamento via PIX
            </DialogTitle>
            <DialogDescription>
              Escaneie o QR Code ou copie o código para pagar
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Valor Total */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
              <p className="text-sm text-gray-600 mb-1">Valor Total</p>
              <p className="text-3xl font-bold text-blue-600">
                R$ {paymentData?.totalAmount?.toFixed(2) || "0.00"}
              </p>
            </div>

            {/* QR Code */}
            {paymentData?.pixQrCode && (
              <div className="flex justify-center">
                <img
                  src={paymentData.pixQrCode}
                  alt="QR Code PIX"
                  className="w-64 h-64 border-2 border-gray-200 rounded-lg"
                />
              </div>
            )}

            {/* Código Copia e Cola */}
            {paymentData?.pixCopyPaste && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Código PIX (Copia e Cola):</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={paymentData.pixCopyPaste}
                    readOnly
                    className="flex-1 px-3 py-2 text-xs border rounded-lg bg-gray-50 font-mono"
                  />
                  <Button onClick={copyPixCode} size="sm">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Instruções */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-xs text-yellow-800">
                <strong>⚠️ Importante:</strong> Após realizar o pagamento, o status será
                atualizado automaticamente em até 5 minutos.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={closePaymentDialog}>Já Paguei</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
