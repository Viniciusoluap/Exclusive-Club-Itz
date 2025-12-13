import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Plus, Fuel, TrendingUp, ArrowLeft, Trash2, FileText, Mail, DollarSign, AlertCircle, ExternalLink, Settings, RefreshCw, CheckCircle, XCircle, Clock, Banknote } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "wouter";

export default function Abastecimento() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  const [liters, setLiters] = useState("");
  const [pricePerLiter, setPricePerLiter] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");
  const [isBudgetDialogOpen, setIsBudgetDialogOpen] = useState(false);
  const [budgetAmount, setBudgetAmount] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);

  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  const trpcAny = trpc as any;
  const { data: recentBookings } = trpcAny.bookings?.getRecent.useQuery({ onlyUsed: true }) || { data: [] }; // Busca apenas as últimas 6 reservas utilizadas
  const { data: fuelRecords, refetch } = trpcAny.fuelRecords?.list.useQuery({}) || { data: [] };
  const { data: vessels } = trpc.vessels.list.useQuery();
  const { data: financialStats } = trpcAny.fuelRecords?.financialStats.useQuery({ monthYear: currentMonth }) || { data: null };
  const { data: budget } = trpcAny.fuelBudget?.get.useQuery({ monthYear: currentMonth }) || { data: null };

  // Debug: ver se recentBookings está vindo
  console.log('[Abastecimento] recentBookings:', recentBookings);
  console.log('[Abastecimento] fuelRecords:', fuelRecords);
  console.log('[Abastecimento] vessels:', vessels);

  const createMutation = trpcAny.fuelRecords?.create.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Abastecimento registrado! Valor total: R$ ${data.totalCost.toFixed(2)}`);
      setIsCreateDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (error: any) => {
      toast.error(`Erro ao registrar abastecimento: ${error.message}`);
    },
  });

  const deleteMutation = trpcAny.fuelRecords?.delete.useMutation({
    onSuccess: () => {
      toast.success('Abastecimento excluído com sucesso!');
      setIsDeleteDialogOpen(false);
      setDeleteId(null);
      refetch();
    },
    onError: (error: any) => {
      toast.error(`Erro ao excluir abastecimento: ${error.message}`);
    },
  });

  const generateReportMutation = trpcAny.fuelRecords?.generateReport.useMutation({
    onSuccess: (data: any) => {
      // Download PDF
      const linkSource = `data:application/pdf;base64,${data.pdf}`;
      const downloadLink = document.createElement('a');
      const fileName = data.filename || `relatorio-abastecimentos-${new Date().toISOString().split('T')[0]}.pdf`;
      downloadLink.href = linkSource;
      downloadLink.download = fileName;
      downloadLink.click();
      
      toast.success(`Relatório gerado com ${selectedIds.length} abastecimento(s)!`);
      setSelectedIds([]);
    },
    onError: (error: any) => {
      toast.error(`Erro ao gerar relatório: ${error.message}`);
    },
  });

  const sendEmailMutation = trpcAny.fuelRecords?.sendReportByEmail.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Relatório enviado para ${data.email} com sucesso!`);
      setIsEmailDialogOpen(false);
      setEmailAddress("");
      setSelectedIds([]);
    },
    onError: (error: any) => {
      toast.error(`Erro ao enviar email: ${error.message}`);
    },
  });

  const syncWithAsaasMutation = trpcAny.fuelRecords?.syncWithAsaas.useMutation({
    onSuccess: (data: any) => {
      toast.success(data.message || 'Sincronizado com sucesso!');
      refetch();
    },
    onError: (error: any) => {
      toast.error(`Erro ao sincronizar: ${error.message}`);
    },
  });

  const syncAllPendingMutation = trpcAny.fuelRecords?.syncAllPending.useMutation({
    onSuccess: (data: any) => {
      toast.success(`Sincronização concluída! ${data.successCount} sucesso(s), ${data.failCount} falha(s)`);
      if (data.errors && data.errors.length > 0) {
        console.error('[Sync Errors]', data.errors);
      }
      refetch();
    },
    onError: (error: any) => {
      toast.error(`Erro ao sincronizar em lote: ${error.message}`);
    },
  });

  const markAsPaidMutation = trpcAny.fuelRecords?.markAsPaid.useMutation({
    onSuccess: () => {
      toast.success('Pagamento marcado como recebido!');
      refetch();
    },
    onError: (error: any) => {
      toast.error(`Erro ao marcar pagamento: ${error.message}`);
    },
  });

  const handleSyncWithAsaas = (id: number) => {
    syncWithAsaasMutation.mutate({ id });
  };

  const handleSyncAllPending = () => {
    if (confirm('Deseja sincronizar todos os abastecimentos pendentes com o Asaas?')) {
      syncAllPendingMutation.mutate();
    }
  };

  const handleMarkAsPaid = (id: number) => {
    const note = prompt('Observação sobre o pagamento (opcional):');
    if (note !== null) { // null = cancelou, string vazia = confirmou sem observação
      markAsPaidMutation.mutate({ id, note: note || undefined });
    }
  };

  const setBudgetMutation = trpcAny.fuelBudget?.set.useMutation({
    onSuccess: () => {
      toast.success('Orçamento configurado com sucesso!');
      setIsBudgetDialogOpen(false);
      setBudgetAmount("");
      // Refetch stats to update dashboard
      trpcAny.fuelRecords?.financialStats.refetch?.();
      trpcAny.fuelBudget?.get.refetch?.();
    },
    onError: (error: any) => {
      toast.error(`Erro ao configurar orçamento: ${error.message}`);
    },
  });

  const resetForm = () => {
    setSelectedBookingId(null);
    setLiters("");
    setPricePerLiter("");
    setNotes("");
    setReceiptFile(null);
  };

  const handleDeleteClick = (id: number) => {
    setDeleteId(id);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (deleteId) {
      deleteMutation.mutate({ id: deleteId });
    }
  };

  const handleToggleSelection = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    // Aplicar filtro de visualização
    const displayRecords = showAllRecords ? fuelRecords : fuelRecords?.slice(0, 10);
    const displayIds = displayRecords?.map((r: any) => r.id) || [];
    
    // Se todos os registros visíveis estão selecionados, desmarcar todos
    const allDisplayedSelected = displayIds.every((id: number) => selectedIds.includes(id));
    
    if (allDisplayedSelected && selectedIds.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(displayIds);
    }
  };

  const handleGenerateReport = () => {
    if (selectedIds.length === 0) {
      toast.error('Selecione pelo menos um abastecimento');
      return;
    }
    generateReportMutation.mutate({ recordIds: selectedIds });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedBookingId) {
      toast.error('Selecione uma reserva');
      return;
    }

    const booking = recentBookings?.find((b: any) => b.id === selectedBookingId);
    if (!booking) {
      toast.error('Reserva não encontrada');
      return;
    }

    let receiptUrl: string | undefined = undefined;

    // Upload do comprovante se existir
    if (receiptFile) {
      try {
        setIsUploadingReceipt(true);
        const formData = new FormData();
        formData.append('file', receiptFile);

        // Upload para S3 via endpoint do servidor
        const response = await fetch('/api/upload-receipt', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          throw new Error('Erro ao fazer upload do comprovante');
        }

        const data = await response.json();
        receiptUrl = data.url;
      } catch (error: any) {
        toast.error(`Erro ao fazer upload: ${error.message}`);
        setIsUploadingReceipt(false);
        return;
      } finally {
        setIsUploadingReceipt(false);
      }
    }

    createMutation.mutate({
      bookingId: selectedBookingId,
      vesselId: booking.vesselId,
      liters: parseFloat(liters),
      pricePerLiter: parseFloat(pricePerLiter),
      notes: notes || undefined,
      receiptUrl,
    });
  };

  const SERVICE_FEE = 10.00; // Taxa de abastecimento e aplicativo
  
  const subtotal = liters && pricePerLiter 
    ? parseFloat(liters) * parseFloat(pricePerLiter)
    : 0;
  
  const totalCost = liters && pricePerLiter
    ? (subtotal + SERVICE_FEE).toFixed(2)
    : "0.00";

  return (
    <div className="container py-8">
      <div className="mb-6">
        <Link href="/admin">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Abastecimento</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              Registre o abastecimento das embarcações após o uso
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {fuelRecords && fuelRecords.length > 0 && (
              <>
                <Button 
                  variant="outline"
                  onClick={handleSyncAllPending}
                  disabled={syncAllPendingMutation.isPending}
                  className="flex-1 sm:flex-none bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                >
                  {syncAllPendingMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  <span className="hidden sm:inline">Sincronizar Pendentes</span>
                  <span className="sm:hidden">Sync</span>
                </Button>
                <Button 
                  variant="outline"
                  onClick={handleGenerateReport}
                  disabled={selectedIds.length === 0 || generateReportMutation.isPending}
                  className="flex-1 sm:flex-none"
                >
                  {generateReportMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4 mr-2" />
                  )}
                  <span className="hidden sm:inline">Relatório PDF</span>
                  <span className="sm:hidden">PDF</span>
                  {selectedIds.length > 0 && ` (${selectedIds.length})`}
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => setIsEmailDialogOpen(true)}
                  disabled={selectedIds.length === 0 || sendEmailMutation.isPending}
                  className="flex-1 sm:flex-none"
                >
                  {sendEmailMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="w-4 h-4 mr-2" />
                  )}
                  <span className="hidden sm:inline">Enviar Email</span>
                  <span className="sm:hidden">Email</span>
                  {selectedIds.length > 0 && ` (${selectedIds.length})`}
                </Button>
              </>
            )}
            <Button 
              onClick={() => setIsCreateDialogOpen(true)}
              className="flex-1 sm:flex-none"
            >
              <Plus className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Registrar Abastecimento</span>
              <span className="sm:hidden">Registrar</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Financial Dashboard */}
      {financialStats && (
        <div className="mb-8 space-y-4">
          {/* Cards de Resumo */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Cobrado</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">R$ {financialStats.totalBilled.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">
                  {financialStats.totalRecords} abastecimento(s)
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Recebido</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">R$ {financialStats.totalReceived.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">
                  Pagamentos confirmados
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pendente</CardTitle>
                <AlertCircle className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">R$ {financialStats.totalPending.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">
                  {financialStats.totalOverdue > 0 && `R$ ${financialStats.totalOverdue.toFixed(2)} vencido`}
                  {financialStats.totalOverdue === 0 && 'Nenhum vencido'}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Saldo</CardTitle>
                <DollarSign className={`h-4 w-4 ${financialStats.balance >= 0 ? 'text-green-600' : 'text-red-600'}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${financialStats.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  R$ {financialStats.balance.toFixed(2)}
                </div>
                <p className="text-xs text-muted-foreground">
                  Recebido - Cobrado
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Orçamento Mensal */}
          {financialStats.totalBudget > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Orçamento Mensal</CardTitle>
                    <CardDescription>
                      {new Date(currentMonth + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setIsBudgetDialogOpen(true)}>
                    <Settings className="w-4 h-4 mr-2" />
                    Configurar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Gasto: R$ {financialStats.totalBilled.toFixed(2)}</span>
                    <span>Orçamento: R$ {financialStats.totalBudget.toFixed(2)}</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2.5">
                    <div 
                      className={`h-2.5 rounded-full ${
                        financialStats.budgetUsagePercent > 90 ? 'bg-red-600' :
                        financialStats.budgetUsagePercent > 70 ? 'bg-yellow-600' :
                        'bg-green-600'
                      }`}
                      style={{ width: `${Math.min(financialStats.budgetUsagePercent, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {financialStats.budgetUsagePercent.toFixed(1)}% utilizado
                  </p>
                  {financialStats.budgetUsagePercent > 90 && (
                    <div className="flex items-center gap-2 text-sm text-red-600 mt-2">
                      <AlertCircle className="w-4 h-4" />
                      <span>Atenção: Orçamento quase esgotado!</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Botão para configurar orçamento se não existir */}
          {(!financialStats.totalBudget || financialStats.totalBudget === 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Orçamento Mensal</CardTitle>
                <CardDescription>
                  Configure um orçamento para acompanhar os gastos
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => setIsBudgetDialogOpen(true)}>
                  <Settings className="w-4 h-4 mr-2" />
                  Configurar Orçamento
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Recent Fuel Records */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-xl font-semibold">Registros Recentes</h2>
          <div className="flex items-center gap-2">
            {fuelRecords && fuelRecords.length > 10 && (
              <div className="flex gap-2">
                <Button
                  variant={!showAllRecords ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowAllRecords(false)}
                >
                  Últimos 10
                </Button>
                <Button
                  variant={showAllRecords ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowAllRecords(true)}
                >
                  Todos os Abastecimentos
                </Button>
              </div>
            )}
            {fuelRecords && fuelRecords.length > 0 && (
            <Button 
              variant="ghost" 
              size="sm"
              onClick={handleSelectAll}
            >
              {selectedIds.length === fuelRecords.length ? 'Desmarcar todos' : 'Selecionar todos'}
            </Button>
            )}
          </div>
        </div>
        {!fuelRecords || fuelRecords.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhum registro de abastecimento encontrado
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {(() => {
              // Aplicar filtro de visualização
              const displayRecords = showAllRecords ? fuelRecords : fuelRecords.slice(0, 10);
              
              return displayRecords.map((record: any) => (
              <Card key={record.id} className={selectedIds.includes(record.id) ? 'ring-2 ring-primary' : ''}>
                <CardHeader className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <Checkbox 
                        checked={selectedIds.includes(record.id)}
                        onCheckedChange={() => handleToggleSelection(record.id)}
                        className="mt-1 flex-shrink-0"
                      />
                      <Fuel className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base sm:text-lg truncate">{record.vessel_name}</CardTitle>
                        <CardDescription className="text-xs sm:text-sm">
                          {record.client_name} • {new Date(record.booking_date).toLocaleDateString('pt-BR')}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:items-start gap-3 sm:gap-4">
                      <div className="text-left sm:text-right flex-1">
                        <div className="text-xl sm:text-2xl font-bold text-primary whitespace-nowrap">
                          R$ {Number(record.total_cost).toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                          <div className="whitespace-nowrap">{Number(record.liters).toFixed(1)}L × R$ {Number(record.price_per_liter).toFixed(2)}</div>
                          <div className="whitespace-nowrap">= R$ {(Number(record.liters) * Number(record.price_per_liter)).toFixed(2)}</div>
                          <div className="whitespace-nowrap">Taxa: R$ 10,00</div>
                        </div>
                        {/* Badges de Status */}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {/* Badge de Pagamento */}
                          {record.payment_status === 'paid' && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              ✓ Pago
                            </span>
                          )}
                          {record.payment_status === 'pending' && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              ⏳ Pendente
                            </span>
                          )}
                          {record.payment_status === 'overdue' && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              ⚠ Vencido
                            </span>
                          )}
                          {record.payment_status === 'cancelled' && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              ✕ Cancelado
                            </span>
                          )}
                          
                          {/* Badge de Sincronização Asaas */}
                          {record.sync_status === 'synced' && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800" title="Sincronizado com Asaas">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Asaas OK
                            </span>
                          )}
                          {record.sync_status === 'pending' && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800" title="Aguardando sincronização">
                              <Clock className="w-3 h-3 mr-1" />
                              Sync Pendente
                            </span>
                          )}
                          {record.sync_status === 'failed' && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800" title={record.sync_error || 'Erro ao sincronizar'}>
                              <XCircle className="w-3 h-3 mr-1" />
                              Sync Falhou
                            </span>
                          )}
                          {record.sync_status === 'manual' && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800" title="Pagamento marcado manualmente">
                              <Banknote className="w-3 h-3 mr-1" />
                              Manual
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        {/* Botões de Ação */}
                        {(record.sync_status === 'pending' || record.sync_status === 'failed') && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSyncWithAsaas(record.id)}
                            disabled={syncWithAsaasMutation.isPending}
                            className="whitespace-nowrap bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                          >
                            {syncWithAsaasMutation.isPending ? (
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3 h-3 mr-1" />
                            )}
                            Sincronizar
                          </Button>
                        )}
                        {record.payment_status !== 'paid' && record.sync_status !== 'manual' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleMarkAsPaid(record.id)}
                            disabled={markAsPaidMutation.isPending}
                            className="whitespace-nowrap"
                          >
                            <Banknote className="w-3 h-3 mr-1" />
                            Marcar Pago
                          </Button>
                        )}
                        {record.asaas_charge_id && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const asaasUrl = `https://www.asaas.com/c/${record.asaas_charge_id}`;
                              window.open(asaasUrl, '_blank');
                            }}
                            className="whitespace-nowrap"
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            Ver Cobrança
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClick(record.id)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                {record.notes && (
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      <strong>Observações:</strong> {record.notes}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Registrado por: {record.recorded_by_name} • {new Date(record.recorded_at).toLocaleString('pt-BR')}
                    </p>
                  </CardContent>
                )}
              </Card>
              ));
            })()}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Registrar Abastecimento</DialogTitle>
              <DialogDescription>
                Registre o abastecimento após a vistoria da embarcação
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="booking">Reserva *</Label>
                <Select 
                  value={selectedBookingId?.toString()} 
                  onValueChange={(value) => setSelectedBookingId(parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma reserva" />
                  </SelectTrigger>
                  <SelectContent>
                    {recentBookings?.map((booking: any) => {
                      const vessel = vessels?.find(v => v.id === booking.vesselId);
                      return (
                        <SelectItem key={booking.id} value={booking.id.toString()}>
                          {vessel?.name} - {booking.clientName} ({new Date(booking.startTime).toLocaleDateString('pt-BR')})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="liters">Litros Abastecidos *</Label>
                <Input
                  id="liters"
                  type="number"
                  step="0.1"
                  min="0"
                  value={liters}
                  onChange={(e) => setLiters(e.target.value)}
                  placeholder="Ex: 25.5"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="pricePerLiter">Preço por Litro (R$) *</Label>
                <Input
                  id="pricePerLiter"
                  type="number"
                  step="0.01"
                  min="0"
                  value={pricePerLiter}
                  onChange={(e) => setPricePerLiter(e.target.value)}
                  placeholder="Ex: 6.50"
                  required
                />
              </div>

              {liters && pricePerLiter && (
                <div className="p-4 bg-primary/10 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Combustível ({liters}L × R$ {parseFloat(pricePerLiter).toFixed(2)}):</span>
                    <span className="font-medium">R$ {subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Taxa de Abastecimento e Aplicativo:</span>
                    <span className="font-medium">R$ {SERVICE_FEE.toFixed(2)}</span>
                  </div>
                  <div className="border-t pt-2 flex items-center justify-between">
                    <span className="font-semibold">Valor Total:</span>
                    <span className="text-2xl font-bold text-primary">R$ {totalCost}</span>
                  </div>
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="notes">Observações</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Tanque estava pela metade"
                  rows={3}
                />
              </div>

              {/* Campo de Upload de Comprovante */}
              <div className="grid gap-2">
                <Label htmlFor="receipt">Comprovante (Foto do Cupom Fiscal)</Label>
                <Input
                  id="receipt"
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      // Validar tamanho (max 5MB)
                      if (file.size > 5 * 1024 * 1024) {
                        toast.error('Arquivo muito grande. Tamanho máximo: 5MB');
                        e.target.value = '';
                        return;
                      }
                      // Validar tipo
                      if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
                        toast.error('Formato inválido. Use imagem ou PDF');
                        e.target.value = '';
                        return;
                      }
                      setReceiptFile(file);
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Formatos aceitos: JPG, PNG, PDF (máx. 5MB)
                </p>
                {receiptFile && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <span>✓ Arquivo selecionado: {receiptFile.name}</span>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setIsCreateDialogOpen(false);
                  resetForm();
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending || isUploadingReceipt}>
                {(createMutation.isPending || isUploadingReceipt) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isUploadingReceipt ? 'Enviando comprovante...' : 'Registrar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog de envio por email */}
      <Dialog open={isEmailDialogOpen} onOpenChange={setIsEmailDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar Relatório por Email</DialogTitle>
            <DialogDescription>
              Informe o endereço de email para enviar o relatório de abastecimentos
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={emailAddress}
                onChange={(e) => setEmailAddress(e.target.value)}
                placeholder="exemplo@email.com"
                required
              />
            </div>
            <div className="bg-muted p-3 rounded-md text-sm">
              <p className="text-muted-foreground">
                <strong>{selectedIds.length}</strong> abastecimento(s) selecionado(s) serão enviados em PDF.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                setIsEmailDialogOpen(false);
                setEmailAddress("");
              }}
            >
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                if (!emailAddress) {
                  toast.error('Informe um email válido');
                  return;
                }
                sendEmailMutation.mutate({ recordIds: selectedIds, email: emailAddress });
              }}
              disabled={sendEmailMutation.isPending || !emailAddress}
            >
              {sendEmailMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de configuração de orçamento */}
      <Dialog open={isBudgetDialogOpen} onOpenChange={setIsBudgetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar Orçamento Mensal</DialogTitle>
            <DialogDescription>
              Defina o orçamento para {new Date(currentMonth + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="budget">Valor do Orçamento (R$) *</Label>
              <Input
                id="budget"
                type="number"
                step="0.01"
                min="0"
                value={budgetAmount}
                onChange={(e) => setBudgetAmount(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
            {financialStats && financialStats.totalBilled > 0 && (
              <div className="bg-muted p-3 rounded-md text-sm">
                <p className="text-muted-foreground">
                  <strong>Gasto atual:</strong> R$ {financialStats.totalBilled.toFixed(2)}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                setIsBudgetDialogOpen(false);
                setBudgetAmount("");
              }}
            >
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                const amount = parseFloat(budgetAmount);
                if (!amount || amount <= 0) {
                  toast.error('Informe um valor válido');
                  return;
                }
                setBudgetMutation.mutate({ monthYear: currentMonth, totalBudget: amount });
              }}
              disabled={setBudgetMutation.isPending || !budgetAmount}
            >
              {setBudgetMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este registro de abastecimento? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Excluir'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
