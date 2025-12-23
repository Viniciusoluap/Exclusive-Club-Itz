import { useState } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, ArrowLeft, Calendar, CheckCircle2, Clock, Copy, Eye, FileText, Loader2, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useLocation } from 'wouter';

export default function PagamentoDanos() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedInspection, setSelectedInspection] = useState<number | null>(null);
  const [selectedInstallments, setSelectedInstallments] = useState<string>('1');
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentData, setPaymentData] = useState<any>(null);
  const [selectedMonthYear, setSelectedMonthYear] = useState<string>('all');
  
  // Estados para dialog de mudança de vencimento
  const [showDueDateDialog, setShowDueDateDialog] = useState(false);
  const [selectedCharge, setSelectedCharge] = useState<any>(null);
  const [newDueDate, setNewDueDate] = useState('');
  const [dueDateReason, setDueDateReason] = useState('');
  
  // Estados para visualização de comprovante
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);

  // Buscar vistorias reprovadas
  const { data: failedInspections, isLoading: loadingInspections } = trpc.inspectionCharges.myCharges.useQuery(
    { monthYear: selectedMonthYear === 'all' ? undefined : selectedMonthYear },
    { enabled: !!user }
  );

  // Buscar reparos das embarcações
  const { data: repairs, isLoading: loadingRepairs } = trpc.inspectionCharges.myRepairs.useQuery(
    { monthYear: selectedMonthYear === 'all' ? undefined : selectedMonthYear },
    { enabled: !!user }
  );

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

  // Mutation para gerar pagamento PIX de reparos
  const generatePayment = trpc.inspectionCharges.generatePayment.useMutation({
    onSuccess: (data) => {
      setPaymentData(data);
      setShowPaymentDialog(true);
      toast.success('Pagamento gerado com sucesso!');
    },
    onError: (error) => {
      toast.error(error.message || 'Erro ao gerar pagamento');
    },
  });

  // Mutation para solicitar mudança de vencimento
  const requestDueDateChange = trpc.inspectionCharges.requestDueDateChange.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setShowDueDateDialog(false);
      setNewDueDate('');
      setDueDateReason('');
    },
    onError: (error) => {
      toast.error(error.message || 'Erro ao solicitar mudança');
    },
  });

  const handleCreateCharge = (inspectionId: number, amount: number) => {
    setSelectedInspection(inspectionId);
    createCharge.mutate({
      inspectionId,
      totalAmount: amount,
      installments: parseInt(selectedInstallments),
    });
  };

  const handleRequestDueDateChange = () => {
    if (!selectedCharge || !newDueDate || !dueDateReason) {
      toast.error('Preencha todos os campos');
      return;
    }

    requestDueDateChange.mutate({
      chargeId: selectedCharge.id,
      newDueDate,
      reason: dueDateReason,
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Código PIX copiado!');
  };

  // Gerar opções de mês/ano (últimos 12 meses)
  const monthYearOptions = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const label = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    monthYearOptions.push({ value: monthYear, label });
  }

  if (authLoading || loadingInspections || loadingRepairs) {
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
        {/* Header com botão Voltar */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setLocation('/dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
            Pagamento de Danos
          </h1>
          <p className="text-gray-600">
            Vistorias reprovadas e reparos de embarcações
          </p>
        </div>

        {/* Filtro de Mês/Ano */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Label className="text-sm font-medium whitespace-nowrap">Filtrar por período:</Label>
              <Select value={selectedMonthYear} onValueChange={setSelectedMonthYear}>
                <SelectTrigger className="w-[250px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os períodos</SelectItem>
                  {monthYearOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Seção 1: Vistorias Reprovadas */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <AlertCircle className="h-6 w-6 text-red-500" />
            Vistorias Reprovadas
          </h2>

          {!failedInspections || failedInspections.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
                <p className="text-gray-600">Nenhuma vistoria reprovada encontrada.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {failedInspections.map((charge: any) => {
                const failedItems = typeof charge.failed_items === 'string' 
                  ? JSON.parse(charge.failed_items) 
                  : charge.failed_items || [];

                return (
                  <Card key={charge.id} className="overflow-hidden">
                    <CardHeader className="bg-gradient-to-r from-red-50 to-orange-50">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-xl">
                            {charge.vessel_name}
                            <Badge variant="destructive" className="ml-2">
                              Reprovada
                            </Badge>
                          </CardTitle>
                          <CardDescription>
                            Vistoria em {new Date(charge.inspection_date).toLocaleDateString('pt-BR')}
                          </CardDescription>
                        </div>
                        <Badge
                          variant={
                            charge.payment_status === 'paid'
                              ? 'default'
                              : charge.payment_status === 'overdue'
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {charge.payment_status === 'paid'
                            ? 'Pago'
                            : charge.payment_status === 'overdue'
                            ? 'Vencido'
                            : 'Pendente'}
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
                          {failedItems.map((item: any, idx: number) => (
                            <Badge key={idx} variant="outline" className="bg-red-50 text-red-700 border-red-200">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              {item.name}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <Separator />

                      {/* Informações de Pagamento */}
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Valor</p>
                          <p className="font-semibold text-lg">
                            R$ {parseFloat(charge.amount).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">Vencimento</p>
                          <p className="font-semibold">
                            {new Date(charge.due_date).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      </div>

                      {/* Ações */}
                      <div className="flex gap-2">
                        {charge.payment_status !== 'paid' && (
                          <>
                            <Button className="flex-1" variant="default">
                              <QrCode className="h-4 w-4 mr-2" />
                              Pagar com PIX
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setSelectedCharge(charge);
                                setShowDueDateDialog(true);
                              }}
                            >
                              <Calendar className="h-4 w-4 mr-2" />
                              Solicitar Mudança de Vencimento
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Seção 2: Reparos da Embarcação */}
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-500" />
            Reparos da Embarcação
          </h2>

          {!repairs || repairs.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
                <p className="text-gray-600">Nenhum reparo encontrado.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {repairs.map((repair: any) => (
                <Card key={repair.id} className="overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-xl">
                          {repair.vesselName}
                          <Badge variant="outline" className="ml-2">
                            Reparo
                          </Badge>
                        </CardTitle>
                        <CardDescription>
                          {repair.description || 'Reparo da embarcação'}
                        </CardDescription>
                      </div>
                      <Badge
                        variant={
                          repair.paymentStatus === 'paid'
                            ? 'default'
                            : repair.paymentStatus === 'overdue'
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {repair.paymentStatus === 'paid'
                          ? 'Pago'
                          : repair.paymentStatus === 'overdue'
                          ? 'Vencido'
                          : repair.asaasChargeId ? 'Pendente' : 'Aguardando Orçamento'}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-6 space-y-4">
                    {/* Informações de Rateio */}
                    {repair.asaasChargeId ? (
                      <>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Valor Total do Reparo:</span>
                            <span className="font-semibold">R$ {repair.totalAmount.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Sua Cota ({(repair.quotaShare * 100).toFixed(0)}%):</span>
                            <span className="font-semibold text-lg text-blue-700">
                              R$ {repair.individualAmount.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Vencimento:</span>
                            <span className="font-semibold">
                              {new Date(repair.dueDate).toLocaleDateString('pt-BR')}
                            </span>
                          </div>
                        </div>

                        <Separator />

                        {/* Opções de Parcelamento */}
                        {repair.paymentStatus !== 'paid' && (
                          <div className="space-y-3">
                            <Label className="text-sm font-medium">Escolha a forma de pagamento:</Label>
                            <RadioGroup
                              value={selectedInstallments}
                              onValueChange={setSelectedInstallments}
                              className="space-y-2"
                            >
                              <div className="flex items-center space-x-2 border rounded-lg p-3 hover:bg-gray-50 cursor-pointer">
                                <RadioGroupItem value="1" id={`1x-repair-${repair.id}`} />
                                <Label htmlFor={`1x-repair-${repair.id}`} className="flex-1 cursor-pointer">
                                  <span className="font-semibold">1x de R$ {repair.individualAmount.toFixed(2)}</span>
                                  <span className="text-xs text-gray-500 ml-2">(à vista)</span>
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2 border rounded-lg p-3 hover:bg-gray-50 cursor-pointer">
                                <RadioGroupItem value="2" id={`2x-repair-${repair.id}`} />
                                <Label htmlFor={`2x-repair-${repair.id}`} className="flex-1 cursor-pointer">
                                  <span className="font-semibold">
                                    2x de R$ {(repair.individualAmount / 2).toFixed(2)}
                                  </span>
                                  <span className="text-xs text-gray-500 ml-2">(sem juros)</span>
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2 border rounded-lg p-3 hover:bg-gray-50 cursor-pointer">
                                <RadioGroupItem value="3" id={`3x-repair-${repair.id}`} />
                                <Label htmlFor={`3x-repair-${repair.id}`} className="flex-1 cursor-pointer">
                                  <span className="font-semibold">
                                    3x de R$ {(repair.individualAmount / 3).toFixed(2)}
                                  </span>
                                  <span className="text-xs text-gray-500 ml-2">(sem juros)</span>
                                </Label>
                              </div>
                            </RadioGroup>
                          </div>
                        )}

                        {/* Ações */}
                        <div className="flex gap-2">
                          {repair.receiptUrl && (
                            <Button
                              variant="outline"
                              onClick={() => {
                                setSelectedReceipt(repair.receiptUrl);
                                setShowReceiptDialog(true);
                              }}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Ver Comprovante
                            </Button>
                          )}
                          {repair.paymentStatus !== 'paid' && (
                            <>
                              <Button 
                                className="flex-1" 
                                variant="default"
                                onClick={() => {
                                  setSelectedCharge(repair);
                                  generatePayment.mutate({
                                    chargeIds: [repair.id],
                                    installments: 1, // Padrão: à vista
                                  });
                                }}
                                disabled={generatePayment.isPending}
                              >
                                {generatePayment.isPending && selectedCharge?.id === repair.id ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Gerando...
                                  </>
                                ) : (
                                  <>
                                    <QrCode className="h-4 w-4 mr-2" />
                                    Pagar com PIX
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setSelectedCharge(repair);
                                  setShowDueDateDialog(true);
                                }}
                              >
                                <Calendar className="h-4 w-4 mr-2" />
                                Solicitar Mudança de Vencimento
                              </Button>
                            </>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                          <Clock className="h-5 w-5 text-yellow-600 mt-0.5" />
                          <div className="flex-1">
                            <h4 className="font-semibold text-yellow-900 mb-1">
                              Aguardando Orçamento
                            </h4>
                            <p className="text-sm text-yellow-700">
                              O orçamento do reparo ainda está sendo calculado. Você será notificado quando estiver disponível.
                            </p>
                          </div>
                        </div>
                        {repair.receiptUrl && (
                          <Button
                            variant="outline"
                            className="mt-3"
                            onClick={() => {
                              setSelectedReceipt(repair.receiptUrl);
                              setShowReceiptDialog(true);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Ver Comprovante
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dialog de Mudança de Vencimento */}
      <Dialog open={showDueDateDialog} onOpenChange={setShowDueDateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Solicitar Mudança de Vencimento</DialogTitle>
            <DialogDescription>
              Preencha os campos abaixo para solicitar uma nova data de vencimento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newDueDate">Nova Data de Vencimento</Label>
              <input
                id="newDueDate"
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
                min={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Motivo da Solicitação</Label>
              <Textarea
                id="reason"
                value={dueDateReason}
                onChange={(e) => setDueDateReason(e.target.value)}
                placeholder="Explique o motivo da solicitação (mínimo 10 caracteres)"
                rows={4}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDueDateDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleRequestDueDateChange}
              disabled={requestDueDateChange.isPending || !newDueDate || dueDateReason.length < 10}
            >
              {requestDueDateChange.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                'Enviar Solicitação'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Visualização de Comprovante */}
      <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Comprovante de Reparo</DialogTitle>
          </DialogHeader>

          {selectedReceipt && (
            <div className="space-y-4">
              {selectedReceipt.toLowerCase().endsWith('.pdf') ? (
                <embed src={selectedReceipt} type="application/pdf" className="w-full h-[600px] rounded-lg" />
              ) : (
                <img src={selectedReceipt} alt="Comprovante" className="w-full rounded-lg" />
              )}
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setShowReceiptDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Pagamento (mantido do código original) */}
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
