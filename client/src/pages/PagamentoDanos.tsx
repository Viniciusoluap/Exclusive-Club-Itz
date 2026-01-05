import { useState } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertCircle, ArrowLeft, Calendar, CheckCircle2, Clock, Copy, Download, Eye, FileText, Loader2, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
// RadioGroup removido - agora apenas pagamento à vista
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useLocation } from 'wouter';

export default function PagamentoDanos() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedInspection, setSelectedInspection] = useState<number | null>(null);
  // Sempre pagamento à vista (1x)
  const selectedInstallments = '1';
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentData, setPaymentData] = useState<any>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  
  // Estados para dialog de mudança de vencimento
  const [showDueDateDialog, setShowDueDateDialog] = useState(false);
  const [selectedCharge, setSelectedCharge] = useState<any>(null);
  const [newDueDate, setNewDueDate] = useState('');
  const [dueDateReason, setDueDateReason] = useState('');
  
  // Estados para visualização de comprovante
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);

  // Construir monthYear a partir de mês e ano selecionados
  const selectedMonthYear = selectedMonth !== 'all' && selectedYear !== 'all' 
    ? `${selectedYear}-${selectedMonth}` 
    : 'all';

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
      console.log('[PagamentoDanos] Dados recebidos do backend:', data);
      console.log('[PagamentoDanos] pixQrCode existe?', !!data.pixQrCode);
      console.log('[PagamentoDanos] pixCopyPaste existe?', !!data.pixCopyPaste);
      console.log('[PagamentoDanos] Tamanho pixQrCode:', data.pixQrCode?.length || 0);
      console.log('[PagamentoDanos] Tamanho pixCopyPaste:', data.pixCopyPaste?.length || 0);
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
    if (!selectedCharge || !newDueDate) {
      toast.error('Selecione uma nova data de vencimento');
      return;
    }

    requestDueDateChange.mutate({
      chargeId: selectedCharge.id,
      newDueDate,
      reason: dueDateReason || undefined,
    });
  };

  const handleGenerateInspectionPayment = (chargeId: number) => {
    generatePayment.mutate({
      chargeIds: [chargeId],
      installments: parseInt(selectedInstallments),
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Código PIX copiado!');
  };

  // Gerar opções de mês
  const monthOptions = [
    { value: '01', label: 'Janeiro' },
    { value: '02', label: 'Fevereiro' },
    { value: '03', label: 'Março' },
    { value: '04', label: 'Abril' },
    { value: '05', label: 'Maio' },
    { value: '06', label: 'Junho' },
    { value: '07', label: 'Julho' },
    { value: '08', label: 'Agosto' },
    { value: '09', label: 'Setembro' },
    { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' },
    { value: '12', label: 'Dezembro' },
  ];

  // Gerar opções de ano (2025, 2026, 2027)
  const yearOptions = [
    { value: '2025', label: '2025' },
    { value: '2026', label: '2026' },
    { value: '2027', label: '2027' },
  ];

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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Mês</Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {monthOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Ano</Label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {yearOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
              {failedInspections.map((inspection: any) => {
                const hasCharge = inspection.charge && inspection.charge.id !== null;
                const failedItems = inspection.failed_items || [];
                const reprovationPhotos = inspection.reprovation_photos || [];

                return (
                  <Card key={inspection.inspection_id} className="overflow-hidden">
                    <CardHeader className="bg-gradient-to-r from-red-50 to-orange-50">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-xl">
                            {inspection.vessel_name}
                            <Badge variant="destructive" className="ml-2">
                              Reprovada
                            </Badge>
                          </CardTitle>
                          <CardDescription>
                            Vistoria em {new Date(inspection.inspection_date).toLocaleDateString('pt-BR')}
                          </CardDescription>
                        </div>
                        {hasCharge ? (
                          <Badge
                            variant={
                              inspection.charge.payment_status === 'paid'
                                ? 'default'
                                : inspection.charge.payment_status === 'overdue'
                                ? 'destructive'
                                : 'secondary'
                            }
                          >
                            {inspection.charge.payment_status === 'paid'
                              ? 'Pago'
                              : inspection.charge.payment_status === 'overdue'
                              ? 'Vencido'
                              : 'Pendente'}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
                            Aguardando Orçamento
                          </Badge>
                        )}
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

                      {/* Fotos dos Itens Reprovados */}
                      {reprovationPhotos.length > 0 && (
                        <>
                          <Separator />
                          <div>
                            <h4 className="font-semibold text-sm text-gray-700 mb-2">
                              Fotos dos Danos
                            </h4>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                              {reprovationPhotos.map((photo: any, idx: number) => (
                                <Button
                                  key={idx}
                                  variant="outline"
                                  size="sm"
                                  className="justify-start"
                                  onClick={() => window.open(photo.photoUrl, '_blank')}
                                >
                                  <Download className="h-4 w-4 mr-2" />
                                  {photo.itemName}
                                </Button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}

                      <Separator />

                      {/* Conteúdo Condicional: Aguardando Orçamento vs Valor Disponível */}
                      {!hasCharge ? (
                        // Sem cobrança: Aguardando Orçamento
                        <Alert className="bg-yellow-50 border-yellow-200">
                          <Clock className="h-4 w-4 text-yellow-700" />
                          <AlertDescription className="text-yellow-800">
                            Estamos preparando o orçamento para os reparos necessários. 
                            Você será notificado quando o valor estiver disponível para pagamento.
                          </AlertDescription>
                        </Alert>
                      ) : (
                        // Com cobrança: Mostrar valor e opções de pagamento
                        <>
                          {/* Informações de Pagamento */}
                          <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Valor da Cobrança:</span>
                              <span className="font-semibold text-lg text-red-700">
                                R$ {parseFloat(inspection.charge.amount).toFixed(2)}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600">Vencimento:</span>
                              <span className="font-semibold">
                                {new Date(inspection.charge.due_date).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                          </div>

                          {/* Opções de Parcelamento */}
                          {inspection.charge.payment_status !== 'paid' && (
                            <>
                              <Separator />
                              <div className="space-y-3">
                                <Label className="text-sm font-medium">Forma de pagamento:</Label>
                                <div className="flex items-center space-x-2 border rounded-lg p-3 bg-blue-50 border-blue-200">
                                  <div className="flex-1">
                                    <span className="font-semibold">
                                      1x de R$ {parseFloat(inspection.charge.amount).toFixed(2)}
                                    </span>
                                    <span className="text-xs text-gray-500 ml-2">(à vista)</span>
                                  </div>
                                </div>
                              </div>

                              {/* Botões de Ação */}
                              <div className="flex gap-2">
                                <Button 
                                  className="flex-1" 
                                  variant="default"
                                  onClick={() => handleGenerateInspectionPayment(inspection.charge.id)}
                                  disabled={generatePayment.isPending}
                                >
                                  {generatePayment.isPending ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <QrCode className="h-4 w-4 mr-2" />
                                  )}
                                  Pagar com PIX
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedCharge(inspection.charge);
                                    setShowDueDateDialog(true);
                                  }}
                                >
                                  <Calendar className="h-4 w-4 mr-2" />
                                  Solicitar Mudança de Vencimento
                                </Button>
                              </div>
                            </>
                          )}

                          {/* Comprovante de Pagamento */}
                          {inspection.charge.payment_status === 'paid' && inspection.charge.receipt_url && (
                            <Button
                              variant="outline"
                              className="w-full"
                              onClick={() => {
                                setSelectedReceipt(inspection.charge.receipt_url);
                                setShowReceiptDialog(true);
                              }}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Ver Comprovante
                            </Button>
                          )}
                        </>
                      )}
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
                    {/* Foto do Reparo */}
                    {repair.photoUrl && (
                      <>
                        <div>
                          <h4 className="font-semibold text-sm text-gray-700 mb-2">
                            Foto do Reparo
                          </h4>
                          <div className="grid grid-cols-1 gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="justify-start"
                              onClick={() => window.open(repair.photoUrl, '_blank')}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Visualizar Foto
                            </Button>
                          </div>
                        </div>
                        <Separator />
                      </>
                    )}

                    {/* Informações de Rateio */}
                    {repair.asaasChargeId ? (
                      <>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Valor Total do Reparo:</span>
                            <span className="font-semibold">R$ {repair.totalAmount.toFixed(2)}</span>
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
                            <Label className="text-sm font-medium">Forma de pagamento:</Label>
                            <div className="flex items-center space-x-2 border rounded-lg p-3 bg-blue-50 border-blue-200">
                              <div className="flex-1">
                                <span className="font-semibold">1x de R$ {repair.individualAmount.toFixed(2)}</span>
                                <span className="text-xs text-gray-500 ml-2">(à vista)</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Botões de Ação */}
                        {repair.paymentStatus !== 'paid' && (
                          <div className="flex gap-2">
                            <Button
                              className="flex-1"
                              variant="default"
                              onClick={() => {
                                generatePayment.mutate({
                                  chargeIds: [repair.id],
                                  installments: parseInt(selectedInstallments),
                                });
                              }}
                              disabled={generatePayment.isPending}
                            >
                              {generatePayment.isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <QrCode className="h-4 w-4 mr-2" />
                              )}
                              Pagar com PIX
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setSelectedCharge({ id: repair.id, due_date: repair.dueDate });
                                setShowDueDateDialog(true);
                              }}
                            >
                              <Calendar className="h-4 w-4 mr-2" />
                              Solicitar Mudança de Vencimento
                            </Button>
                          </div>
                        )}

                        {/* Comprovante */}
                        {repair.paymentStatus === 'paid' && repair.paymentReceiptUrl && (
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => {
                              setSelectedReceipt(repair.paymentReceiptUrl);
                              setShowReceiptDialog(true);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Ver Comprovante
                          </Button>
                        )}
                      </>
                    ) : (
                      <Alert className="bg-yellow-50 border-yellow-200">
                        <Clock className="h-4 w-4 text-yellow-700" />
                        <AlertDescription className="text-yellow-800">
                          Aguardando orçamento do reparo. Você será notificado quando estiver disponível.
                        </AlertDescription>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Dialog de Pagamento PIX */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pagamento via PIX</DialogTitle>
            <DialogDescription>
              Escaneie o QR Code ou copie o código para realizar o pagamento
            </DialogDescription>
          </DialogHeader>

          {paymentData && (
            <div className="space-y-4">
              {/* QR Code */}
              {paymentData.pixQrCode && (
                <div className="flex justify-center p-4 bg-white rounded-lg">
                  <img
                    src={`data:image/png;base64,${paymentData.pixQrCode}`}
                    alt="QR Code PIX"
                    className="w-64 h-64"
                  />
                </div>
              )}

              {/* Código Copia e Cola */}
              {paymentData.pixCopyPaste && (
                <div className="space-y-2">
                  <Label>Código PIX (Copia e Cola)</Label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={paymentData.pixCopyPaste}
                      readOnly
                      className="flex-1 px-3 py-2 border rounded-md text-sm bg-gray-50"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(paymentData.pixCopyPaste)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Informações */}
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Após realizar o pagamento, aguarde alguns minutos para a confirmação automática.
                </AlertDescription>
              </Alert>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Mudança de Vencimento */}
      <Dialog open={showDueDateDialog} onOpenChange={setShowDueDateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar Mudança de Vencimento</DialogTitle>
            <DialogDescription>
              Preencha os campos abaixo para solicitar uma nova data de vencimento
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
              <Label htmlFor="reason">Motivo da Solicitação <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Textarea
                id="reason"
                value={dueDateReason}
                onChange={(e) => setDueDateReason(e.target.value)}
                placeholder="Descreva o motivo da mudança, se desejar..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDueDateDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleRequestDueDateChange}
              disabled={requestDueDateChange.isPending}
            >
              {requestDueDateChange.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Solicitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Visualização de Comprovante */}
      <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Comprovante de Pagamento</DialogTitle>
          </DialogHeader>

          {selectedReceipt && (
            <div className="flex justify-center">
              <img
                src={selectedReceipt}
                alt="Comprovante"
                className="max-w-full h-auto rounded-lg"
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReceiptDialog(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
