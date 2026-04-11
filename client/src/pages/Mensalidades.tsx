import { useState } from 'react';
import { useAuth } from '@/_core/hooks/useAuth';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft, Calendar, CheckCircle2, Clock, AlertCircle,
  Loader2, ExternalLink, RefreshCw, FileText, CreditCard
} from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLocation } from 'wouter';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

const MONTHS = [
  { value: '1', label: 'Janeiro' },
  { value: '2', label: 'Fevereiro' },
  { value: '3', label: 'Março' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Maio' },
  { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 4 }, (_, i) => String(CURRENT_YEAR - 1 + i));

type ChargeStatus = 'pending' | 'received' | 'confirmed' | 'overdue' | 'refunded' | 'receivedInCash' | 'awaitingChargeback' | 'detached' | 'partiallyPaid';

function statusLabel(status: ChargeStatus | string): string {
  const map: Record<string, string> = {
    pending: 'Pendente',
    received: 'Recebido',
    confirmed: 'Confirmado',
    overdue: 'Vencido',
    refunded: 'Estornado',
    receivedInCash: 'Recebido em Dinheiro',
    awaitingChargeback: 'Aguardando Chargeback',
    detached: 'Desvinculado',
    partiallyPaid: 'Parcialmente Pago',
  };
  return map[status] ?? status;
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (['received', 'confirmed', 'receivedInCash'].includes(status)) return 'default';
  if (status === 'overdue') return 'destructive';
  if (status === 'pending') return 'secondary';
  return 'outline';
}

function typeLabel(type: string | null): string {
  if (type === 'monthly') return 'Mensalidade';
  if (type === 'quota_sale') return 'Venda de Cota';
  if (type === 'fuel') return 'Combustível';
  if (type === 'repair') return 'Reparo';
  return 'Outro';
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
}

export default function Mensalidades() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>(String(CURRENT_YEAR));
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // Dialog de mudança de vencimento
  const [showDueDateDialog, setShowDueDateDialog] = useState(false);
  const [selectedCharge, setSelectedCharge] = useState<any>(null);
  const [newDueDate, setNewDueDate] = useState('');
  const [dueDateReason, setDueDateReason] = useState('');

  // Construir filtros para a query
  const queryInput = {
    types: ['monthly', 'quota_sale'] as ('monthly' | 'quota_sale')[],
    year: selectedYear !== 'all' ? Number(selectedYear) : undefined,
    month: selectedMonth !== 'all' ? Number(selectedMonth) : undefined,
    status: selectedStatus !== 'all'
      ? [selectedStatus as ChargeStatus]
      : undefined,
  };

  const { data, isLoading, refetch } = trpc.bpo.getMyCharges.useQuery(queryInput, {
    enabled: !!user,
  });

  const charges = data?.charges ?? [];

  // Totais
  const totalPending = charges
    .filter(c => ['pending', 'overdue'].includes(c.status))
    .reduce((sum, c) => sum + Number(c.value), 0);
  const totalPaid = charges
    .filter(c => ['received', 'confirmed', 'receivedInCash'].includes(c.status))
    .reduce((sum, c) => sum + Number(c.value), 0);

  function handleOpenPaymentLink(charge: any) {
    const url = charge.paymentLink || charge.invoiceUrl || charge.bankSlipUrl;
    if (url) {
      window.open(url, '_blank');
    } else {
      toast.error('Link de pagamento não disponível para esta cobrança.');
    }
  }

  function handleRequestDueDate(charge: any) {
    setSelectedCharge(charge);
    setNewDueDate('');
    setDueDateReason('');
    setShowDueDateDialog(true);
  }

  const requestDueDateMutation = trpc.bpo.requestDueDateChange.useMutation({
    onSuccess: () => {
      toast.success('Solicitação de mudança de vencimento enviada!');
      setShowDueDateDialog(false);
    },
    onError: (err) => {
      toast.error(err.message || 'Erro ao solicitar mudança de vencimento');
    },
  });

  function handleSubmitDueDate() {
    if (!selectedCharge || !newDueDate) {
      toast.error('Informe a nova data de vencimento.');
      return;
    }
    requestDueDateMutation.mutate({
      chargeId: selectedCharge.id as number,
      newDueDate,
      reason: dueDateReason,
    });
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Exclusive Club" className="h-10 w-10 rounded-full object-cover" />
            <span className="font-semibold text-gray-800 hidden sm:block">Exclusive Club</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation('/dashboard')}
              className="flex items-center gap-1 text-gray-600"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Título */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" />
            Mensalidades e Cotas
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Acompanhe suas cobranças de mensalidade e venda de cotas
          </p>
        </div>

        {/* Cards de resumo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="border-l-4 border-l-red-400">
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-gray-500">Em Aberto / Vencido</p>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(totalPending)}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-400">
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-gray-500">Total Pago</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totalPaid)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3 items-end">
              {/* Mês */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500 font-medium">Mês</label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {MONTHS.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Ano */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500 font-medium">Ano</label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="w-28">
                    <SelectValue placeholder="Ano" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {YEARS.map(y => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500 font-medium">Status</label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="overdue">Vencido</SelectItem>
                    <SelectItem value="received">Recebido</SelectItem>
                    <SelectItem value="confirmed">Confirmado</SelectItem>
                    <SelectItem value="receivedInCash">Recebido em Dinheiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="flex items-center gap-1 self-end"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Atualizar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Lista de cobranças */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Cobranças ({charges.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : charges.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p>Nenhuma cobrança encontrada para os filtros selecionados.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {charges.map((charge, idx) => {
                  const isPaid = ['received', 'confirmed', 'receivedInCash'].includes(charge.status);
                  const isOverdue = charge.status === 'overdue';
                  const hasPaymentLink = !!(charge.paymentLink || charge.invoiceUrl || charge.bankSlipUrl);

                  return (
                    <div key={charge.id}>
                      {idx > 0 && <Separator />}
                      <div className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        {/* Info principal */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={statusVariant(charge.status)} className="text-xs">
                              {isPaid ? <CheckCircle2 className="h-3 w-3 mr-1" /> : isOverdue ? <AlertCircle className="h-3 w-3 mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
                              {statusLabel(charge.status)}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {typeLabel(charge.type)}
                            </Badge>
                          </div>
                          <p className="font-semibold text-gray-800 mt-1 truncate">
                            {charge.description || typeLabel(charge.type)}
                          </p>
                          <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-500">
                            <span>Vencimento: <strong>{formatDate(charge.dueDate)}</strong></span>
                            {charge.paidDate && (
                              <span>Pago em: <strong>{formatDate(charge.paidDate)}</strong></span>
                            )}
                          </div>
                        </div>

                        {/* Valor e ações */}
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <span className={`text-lg font-bold ${isPaid ? 'text-green-600' : isOverdue ? 'text-red-600' : 'text-gray-800'}`}>
                            {formatCurrency(charge.value)}
                          </span>
                          <div className="flex gap-2">
                            {!isPaid && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRequestDueDate(charge)}
                                  className="text-xs"
                                >
                                  <Calendar className="h-3.5 w-3.5 mr-1" />
                                  Mudar Vencimento
                                </Button>
                                {hasPaymentLink && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleOpenPaymentLink(charge)}
                                    className="text-xs"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5 mr-1" />
                                    Gerar Cobrança
                                  </Button>
                                )}
                              </>
                            )}
                            {isPaid && (
                              <span className="text-xs text-green-600 flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Pago
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Dialog: Solicitar Mudança de Vencimento */}
      <Dialog open={showDueDateDialog} onOpenChange={setShowDueDateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar Mudança de Vencimento</DialogTitle>
            <DialogDescription>
              Informe a nova data desejada e o motivo. A solicitação será analisada pela equipe.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Cobrança</Label>
              <p className="text-sm text-gray-600">
                {selectedCharge?.description || typeLabel(selectedCharge?.type)} — {formatCurrency(selectedCharge?.value)}
              </p>
              <p className="text-xs text-gray-400">Vencimento atual: {formatDate(selectedCharge?.dueDate)}</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="newDueDate">Nova Data de Vencimento *</Label>
              <Input
                id="newDueDate"
                type="date"
                value={newDueDate}
                onChange={e => setNewDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dueDateReason">Motivo</Label>
              <Textarea
                id="dueDateReason"
                placeholder="Descreva o motivo da solicitação..."
                value={dueDateReason}
                onChange={e => setDueDateReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDueDateDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmitDueDate}
              disabled={requestDueDateMutation.isPending || !newDueDate}
            >
              {requestDueDateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enviar Solicitação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
