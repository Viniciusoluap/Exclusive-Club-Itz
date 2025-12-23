import { useState } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, CheckCircle2, Clock, Copy, Loader2, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function PagamentoDanos() {
  const { user, loading: authLoading } = useAuth();
  const [selectedInspection, setSelectedInspection] = useState<number | null>(null);
  const [selectedInstallments, setSelectedInstallments] = useState<string>('1');
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentData, setPaymentData] = useState<any>(null);

  // Buscar vistorias reprovadas
  const { data: failedInspections, isLoading } = trpc.inspections.myFailedInspections.useQuery(undefined, {
    enabled: !!user,
  });

  // Mutation para criar cobrança parcelada
  const createCharge = trpc.inspectionCharges.createInstallmentCharge.useMutation({
    onSuccess: (data) => {
      setPaymentData(data);
      setShowPaymentDialog(true);
      toast.success('Cobrança criada com sucesso!');
    },
    onError: (error) => {
      toast.error(error.message || 'Erro ao criar cobrança');
    },
  });

  const handleCreateCharge = (inspectionId: number, amount: number) => {
    setSelectedInspection(inspectionId);
    // Aqui você pode abrir um dialog para selecionar parcelas
    // Por enquanto vamos usar 1x como padrão
    createCharge.mutate({
      inspectionId,
      totalAmount: amount,
      installments: parseInt(selectedInstallments),
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Código PIX copiado!');
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Acesso Negado</CardTitle>
            <CardDescription>Você precisa estar autenticado para acessar esta página.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
            Pagamento de Danos
          </h1>
          <p className="text-gray-600">
            Vistorias reprovadas que necessitam de pagamento para conserto
          </p>
        </div>

        {/* Lista de Vistorias Reprovadas */}
        {!failedInspections || failedInspections.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhuma pendência encontrada</h3>
              <p className="text-gray-600">
                Você não possui vistorias reprovadas pendentes de pagamento.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {failedInspections.map((inspection: any) => {
              const failedItems = Object.entries(inspection.inspectionData)
                .filter(([_, status]) => status === 'REPROVADO')
                .map(([name]) => name);

              const hasCharge = !!inspection.charge;
              const estimatedAmount = failedItems.length * 150; // Estimativa de R$ 150 por item

              return (
                <Card key={inspection.id} className="overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-red-50 to-orange-50">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-xl">
                          {inspection.vesselName}
                          <Badge variant="destructive" className="ml-2">
                            Reprovada
                          </Badge>
                        </CardTitle>
                        <CardDescription>
                          Vistoria realizada em {new Date(inspection.createdAt).toLocaleDateString('pt-BR')}
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {inspection.vesselType === 'jetski' ? 'Jet Ski' : 'Lancha'}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-6 space-y-4">
                    {/* Itens Reprovados */}
                    <div>
                      <h4 className="font-semibold text-sm text-gray-700 mb-2">
                        Itens Reprovados ({failedItems.length})
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {failedItems.map((item, idx) => (
                          <Badge key={idx} variant="outline" className="bg-red-50 text-red-700 border-red-200">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            {item}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {inspection.observations && (
                      <>
                        <Separator />
                        <div>
                          <h4 className="font-semibold text-sm text-gray-700 mb-2">Observações</h4>
                          <p className="text-sm text-gray-600">{inspection.observations}</p>
                        </div>
                      </>
                    )}

                    <Separator />

                    {/* Status da Cobrança */}
                    {hasCharge ? (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-blue-900">Cobrança Criada</h4>
                          <Badge
                            variant={
                              inspection.charge.paymentStatus === 'paid'
                                ? 'default'
                                : inspection.charge.paymentStatus === 'overdue'
                                ? 'destructive'
                                : 'secondary'
                            }
                          >
                            {inspection.charge.paymentStatus === 'paid'
                              ? 'Pago'
                              : inspection.charge.paymentStatus === 'overdue'
                              ? 'Vencido'
                              : 'Pendente'}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-gray-600">Valor</p>
                            <p className="font-semibold text-lg">
                              R$ {inspection.charge.amount.toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-600">Vencimento</p>
                            <p className="font-semibold">
                              {new Date(inspection.charge.dueDate).toLocaleDateString('pt-BR')}
                            </p>
                          </div>
                        </div>
                        {inspection.charge.paymentStatus !== 'paid' && (
                          <Button className="w-full" variant="default">
                            <QrCode className="h-4 w-4 mr-2" />
                            Ver QR Code PIX
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <Clock className="h-5 w-5 text-yellow-600 mt-0.5" />
                          <div className="flex-1">
                            <h4 className="font-semibold text-yellow-900 mb-1">
                              Aguardando Orçamento
                            </h4>
                            <p className="text-sm text-yellow-700">
                              O valor estimado para conserto é de{' '}
                              <span className="font-semibold">R$ {estimatedAmount.toFixed(2)}</span>.
                              Você poderá parcelar em até 3x sem juros.
                            </p>
                          </div>
                        </div>

                        {/* Seleção de Parcelas */}
                        <div className="space-y-3 pt-2">
                          <Label className="text-sm font-medium">Escolha a forma de pagamento:</Label>
                          <RadioGroup
                            value={selectedInstallments}
                            onValueChange={setSelectedInstallments}
                            className="space-y-2"
                          >
                            <div className="flex items-center space-x-2 border rounded-lg p-3 hover:bg-gray-50 cursor-pointer">
                              <RadioGroupItem value="1" id={`1x-${inspection.id}`} />
                              <Label htmlFor={`1x-${inspection.id}`} className="flex-1 cursor-pointer">
                                <span className="font-semibold">1x de R$ {estimatedAmount.toFixed(2)}</span>
                                <span className="text-xs text-gray-500 ml-2">(à vista)</span>
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2 border rounded-lg p-3 hover:bg-gray-50 cursor-pointer">
                              <RadioGroupItem value="2" id={`2x-${inspection.id}`} />
                              <Label htmlFor={`2x-${inspection.id}`} className="flex-1 cursor-pointer">
                                <span className="font-semibold">
                                  2x de R$ {(estimatedAmount / 2).toFixed(2)}
                                </span>
                                <span className="text-xs text-gray-500 ml-2">(sem juros)</span>
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2 border rounded-lg p-3 hover:bg-gray-50 cursor-pointer">
                              <RadioGroupItem value="3" id={`3x-${inspection.id}`} />
                              <Label htmlFor={`3x-${inspection.id}`} className="flex-1 cursor-pointer">
                                <span className="font-semibold">
                                  3x de R$ {(estimatedAmount / 3).toFixed(2)}
                                </span>
                                <span className="text-xs text-gray-500 ml-2">(sem juros)</span>
                              </Label>
                            </div>
                          </RadioGroup>
                        </div>

                        <Button
                          className="w-full"
                          onClick={() => handleCreateCharge(inspection.id, estimatedAmount)}
                          disabled={createCharge.isPending}
                        >
                          {createCharge.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Gerando Cobrança...
                            </>
                          ) : (
                            'Gerar Cobrança'
                          )}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog de Pagamento */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cobrança Gerada com Sucesso!</DialogTitle>
            <DialogDescription>
              {paymentData?.installments === 1
                ? 'Pagamento à vista'
                : `Parcelado em ${paymentData?.installments}x sem juros`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Resumo */}
            <Alert>
              <AlertDescription>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Valor Total:</span>
                    <span className="font-semibold">R$ {paymentData?.totalAmount.toFixed(2)}</span>
                  </div>
                  {paymentData?.installments > 1 && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Parcelas:</span>
                      <span className="font-semibold">
                        {paymentData?.installments}x de R${' '}
                        {(paymentData?.totalAmount / paymentData?.installments).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>

            {/* Primeira Parcela (ou única) */}
            {paymentData?.charges && paymentData.charges.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-semibold">
                  {paymentData.installments === 1 ? 'Pagamento' : 'Primeira Parcela'}
                </h4>

                {/* QR Code */}
                {paymentData.charges[0].pixQrCode && (
                  <div className="bg-white border rounded-lg p-4 flex justify-center">
                    <img
                      src={`data:image/png;base64,${paymentData.charges[0].pixQrCode}`}
                      alt="QR Code PIX"
                      className="w-48 h-48"
                    />
                  </div>
                )}

                {/* Código Copia e Cola */}
                {paymentData.charges[0].pixCopyPaste && (
                  <div className="space-y-2">
                    <Label className="text-sm">Código PIX Copia e Cola:</Label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={paymentData.charges[0].pixCopyPaste}
                        readOnly
                        className="flex-1 px-3 py-2 text-xs border rounded-md bg-gray-50 font-mono"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(paymentData.charges[0].pixCopyPaste)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                <div className="text-sm text-gray-600">
                  <p>
                    <strong>Vencimento:</strong>{' '}
                    {new Date(paymentData.charges[0].dueDate).toLocaleDateString('pt-BR')}
                  </p>
                  <p>
                    <strong>Valor:</strong> R$ {paymentData.charges[0].amount.toFixed(2)}
                  </p>
                </div>
              </div>
            )}

            {/* Informações sobre parcelas futuras */}
            {paymentData?.installments > 1 && (
              <Alert>
                <AlertDescription className="text-sm">
                  As próximas parcelas serão geradas automaticamente com vencimento a cada 30 dias.
                  Você receberá o QR Code de cada parcela por email.
                </AlertDescription>
              </Alert>
            )}

            <Button className="w-full" onClick={() => setShowPaymentDialog(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
