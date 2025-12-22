import EmployeeDashboardLayout from "@/components/EmployeeDashboardLayout";
import { useState, useEffect } from "react";
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
import { Loader2, Plus, Fuel, TrendingUp, ArrowLeft, Trash2, FileText, Mail, AlertTriangle, Upload } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "wouter";

export default function EmployeeAbastecimentos() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<number | null>(null);
  
  // Estados para método por peso
  const [litersInitial, setLitersInitial] = useState("");
  const [weightFull, setWeightFull] = useState("");
  const [weightAfter, setWeightAfter] = useState("");
  const [photoBeforeUrl, setPhotoBeforeUrl] = useState("");
  const [photoAfterUrl, setPhotoAfterUrl] = useState("");
  const [photoBeforeFile, setPhotoBeforeFile] = useState<File | null>(null);
  const [photoAfterFile, setPhotoAfterFile] = useState<File | null>(null);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  
  const [pricePerLiter, setPricePerLiter] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [isEmailDialogOpen, setIsEmailDialogOpen] = useState(false);
  const [emailAddress, setEmailAddress] = useState("");

  // Estado de filtro de mês/ano
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1); // 1-12
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());

  const trpcAny = trpc as any;
  const { data: recentBookings } = trpcAny.bookings?.getRecent.useQuery({ onlyUsed: true }) || { data: [] };
  const { data: fuelRecords, refetch } = trpcAny.fuelRecords?.list.useQuery({ 
    month: selectedMonth, 
    year: selectedYear 
  }) || { data: [] };
  const { data: vessels } = trpc.vessels.list.useQuery();
  
  // Buscar orçamento para pegar preço/L e estoque
  const monthYear = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
  const { data: budget } = trpcAny.fuelBudget?.get.useQuery({ monthYear }) || { data: null };

  // Refetch quando mês/ano mudar
  useEffect(() => {
    refetch();
  }, [selectedMonth, selectedYear]);

  // Pré-preencher preço/L automaticamente ao abrir o dialog
  useEffect(() => {
    if (isCreateDialogOpen && budget) {
      // Preencher se houver preço válido (maior que zero)
      if (budget.lastPricePerLiter && budget.lastPricePerLiter > 0) {
        setPricePerLiter(budget.lastPricePerLiter.toFixed(2));
        console.log('✅ Preço/L preenchido automaticamente:', budget.lastPricePerLiter.toFixed(2));
      } else {
        console.warn('⚠️ Nenhum preço/L disponível no estoque. Budget:', budget);
      }
    } else if (!isCreateDialogOpen) {
      // Resetar ao fechar o dialog
      resetForm();
    }
  }, [isCreateDialogOpen, budget]);

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

  const resetForm = () => {
    setSelectedBookingId(null);
    setLitersInitial("");
    setWeightFull("");
    setWeightAfter("");
    setPhotoBeforeUrl("");
    setPhotoAfterUrl("");
    setPhotoBeforeFile(null);
    setPhotoAfterFile(null);
    setPricePerLiter(budget?.lastPricePerLiter ? budget.lastPricePerLiter.toFixed(2) : "");
    setNotes("");
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
    const displayRecords = showAllRecords ? fuelRecords : fuelRecords?.slice(0, 10);
    const displayIds = displayRecords?.map((r: any) => r.id) || [];
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

  // Upload de fotos para S3
  const handlePhotoUpload = async (file: File, type: 'before' | 'after') => {
    setUploadingPhotos(true);
    try {
      // TODO: Implementar upload real para S3
      // Por enquanto, usar URL temporária
      const tempUrl = URL.createObjectURL(file);
      if (type === 'before') {
        setPhotoBeforeUrl(tempUrl);
      } else {
        setPhotoAfterUrl(tempUrl);
      }
      toast.success(`Foto ${type === 'before' ? 'ANTES' : 'DEPOIS'} carregada!`);
    } catch (error) {
      toast.error('Erro ao fazer upload da foto');
    } finally {
      setUploadingPhotos(false);
    }
  };

  // Cálculo automático por regra de 3
  const weightConsumed = weightFull && weightAfter 
    ? parseFloat(weightFull) - parseFloat(weightAfter)
    : 0;

  const litersCalculated = litersInitial && weightFull && weightConsumed > 0
    ? (weightConsumed / parseFloat(weightFull)) * parseFloat(litersInitial)
    : 0;

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Validações
    if (!selectedBookingId) {
      toast.error("Selecione uma reserva");
      return;
    }
    if (!litersInitial || !weightFull || !weightAfter) {
      toast.error("Preencha todos os campos de pesagem");
      return;
    }
    if (!photoBeforeUrl || !photoAfterUrl) {
      toast.error("Envie as fotos da balança (antes e depois)");
      return;
    }
    if (!pricePerLiter) {
      toast.error("Preencha o preço por litro");
      return;
    }

    const booking = recentBookings?.find((b: any) => b.id === selectedBookingId);
    if (!booking) {
      toast.error("Reserva não encontrada");
      return;
    }

    createMutation.mutate({
      bookingId: selectedBookingId,
      vesselId: booking.vesselId,
      // Método por peso
      litersInitial: parseFloat(litersInitial),
      weightFull: parseFloat(weightFull),
      weightAfter: parseFloat(weightAfter),
      photoBeforeUrl,
      photoAfterUrl,
      pricePerLiter: parseFloat(pricePerLiter),
      notes: notes || undefined,
    });
  };

  const SERVICE_FEE = 10.00;
  const subtotal = litersCalculated && pricePerLiter 
    ? litersCalculated * parseFloat(pricePerLiter)
    : 0;
  const totalCost = litersCalculated && pricePerLiter
    ? (subtotal + SERVICE_FEE).toFixed(2)
    : "0.00";

  return (
    <EmployeeDashboardLayout>
      <div className="container py-8">
      <div className="mb-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Abastecimento</h1>
              <p className="text-sm sm:text-base text-muted-foreground mt-1">
                Registre o abastecimento das embarcações após o uso
              </p>
            </div>
            
            {/* Filtros de Mês e Ano */}
            <div className="flex gap-2 items-center">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Mês</Label>
                <Select 
                  value={String(selectedMonth)} 
                  onValueChange={(value) => setSelectedMonth(parseInt(value))}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Janeiro</SelectItem>
                    <SelectItem value="2">Fevereiro</SelectItem>
                    <SelectItem value="3">Março</SelectItem>
                    <SelectItem value="4">Abril</SelectItem>
                    <SelectItem value="5">Maio</SelectItem>
                    <SelectItem value="6">Junho</SelectItem>
                    <SelectItem value="7">Julho</SelectItem>
                    <SelectItem value="8">Agosto</SelectItem>
                    <SelectItem value="9">Setembro</SelectItem>
                    <SelectItem value="10">Outubro</SelectItem>
                    <SelectItem value="11">Novembro</SelectItem>
                    <SelectItem value="12">Dezembro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-muted-foreground">Ano</Label>
                <Select 
                  value={String(selectedYear)} 
                  onValueChange={(value) => setSelectedYear(parseInt(value))}
                >
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2023">2023</SelectItem>
                    <SelectItem value="2024">2024</SelectItem>
                    <SelectItem value="2025">2025</SelectItem>
                    <SelectItem value="2026">2026</SelectItem>
                    <SelectItem value="2027">2027</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Indicador de Estoque (somente visualização) */}
          {budget && (
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Fuel className="w-5 h-5 text-primary" />
                      <span className="font-semibold">
                        Estoque: {budget.stockLiters?.toFixed(2) || "0.00"} L disponíveis
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      💵 Preço/L atual: R$ {budget.lastPricePerLiter?.toFixed(2) || "0.00"}
                    </p>
                  </div>
                  
                  {/* Alerta de estoque baixo */}
                  {budget.stockLiters && budget.stockLiters < 5 && (
                    <div className="flex items-center gap-2 text-red-600 font-semibold">
                      <AlertTriangle className="w-5 h-5" />
                      <span className="text-sm">Estoque baixo! Avise o administrador</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
          
          <div className="flex gap-2 flex-wrap">
            {fuelRecords && fuelRecords.length > 0 && (
              <>
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
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Fuel className="w-5 h-5 text-primary flex-shrink-0" />
                          <CardTitle className="text-base sm:text-lg truncate">{record.vesselName}</CardTitle>
                        </div>
                        <CardDescription className="mt-1 text-xs sm:text-sm break-words">
                          {record.clientName} • {new Date(record.date).toLocaleDateString('pt-BR')}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteClick(record.id)}
                        className="h-8 w-8 p-0"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between sm:block">
                      <span className="text-muted-foreground">Litros:</span>
                      <span className="font-medium ml-2 sm:ml-0">{record.liters.toFixed(2)} L</span>
                    </div>
                    <div className="flex justify-between sm:block">
                      <span className="text-muted-foreground">Preço/L:</span>
                      <span className="font-medium ml-2 sm:ml-0">R$ {record.price_per_liter.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between sm:block">
                      <span className="text-muted-foreground">Total:</span>
                      <span className="font-bold text-primary ml-2 sm:ml-0">R$ {record.total_cost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between sm:block">
                      <span className="text-muted-foreground">Status:</span>
                      <span className={`ml-2 sm:ml-0 font-medium ${
                        record.payment_status === 'paid' ? 'text-green-600' : 
                        record.payment_status === 'overdue' ? 'text-red-600' : 
                        'text-yellow-600'
                      }`}>
                        {record.payment_status === 'paid' ? 'Pago' : 
                         record.payment_status === 'overdue' ? 'Vencido' : 
                         record.payment_status === 'cancelled' ? 'Cancelado' : 'Pendente'}
                      </span>
                    </div>
                  </div>
                  {record.notes && (
                    <div className="mt-2 text-xs text-muted-foreground italic border-t pt-2">
                      {record.notes}
                    </div>
                  )}
                  <div className="mt-2 text-xs text-muted-foreground border-t pt-2">
                    Registrado por: {record.recorded_by_name || 'Sistema'} • {record.recorded_at ? new Date(record.recorded_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Data não disponível'}
                  </div>
                </CardContent>
              </Card>
            ));
            })()}
          </div>
        )}
      </div>

      {/* Dialog de Criar Abastecimento - MÉTODO POR PESO */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>Registrar Abastecimento</DialogTitle>
              <DialogDescription>
                Registre o abastecimento usando o método de pesagem
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Seleção de Reserva */}
              <div>
                <Label>Reserva *</Label>
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

              {/* Método por Peso */}
              <div className="border-t pt-4 space-y-4">
                <h3 className="font-semibold flex items-center gap-2">
                  📏 Método de Pesagem
                </h3>
                
                {/* Litros Iniciais */}
                <div>
                  <Label>Litros Iniciais no Galão (L) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={litersInitial}
                    onChange={(e) => setLitersInitial(e.target.value)}
                    placeholder="Ex: 50.05"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">Quantidade de litros no galão antes do abastecimento</p>
                </div>

                {/* Peso Cheio */}
                <div>
                  <Label>Peso do Galão Cheio (kg) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={weightFull}
                    onChange={(e) => setWeightFull(e.target.value)}
                    placeholder="Ex: 37.80"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">Peso ANTES do abastecimento</p>
                </div>

                {/* Upload Foto ANTES */}
                <div>
                  <Label>Foto da Balança ANTES *</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setPhotoBeforeFile(file);
                          handlePhotoUpload(file, 'before');
                        }
                      }}
                      required={!photoBeforeUrl}
                      disabled={uploadingPhotos}
                    />
                    {photoBeforeUrl && (
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        ✓ Carregada
                      </span>
                    )}
                  </div>
                </div>

                {/* Peso Após */}
                <div>
                  <Label>Peso do Galão Após Abastecer (kg) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={weightAfter}
                    onChange={(e) => setWeightAfter(e.target.value)}
                    placeholder="Ex: 23.40"
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">Peso DEPOIS do abastecimento</p>
                </div>

                {/* Upload Foto DEPOIS */}
                <div>
                  <Label>Foto da Balança DEPOIS *</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setPhotoAfterFile(file);
                          handlePhotoUpload(file, 'after');
                        }
                      }}
                      required={!photoAfterUrl}
                      disabled={uploadingPhotos}
                    />
                    {photoAfterUrl && (
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        ✓ Carregada
                      </span>
                    )}
                  </div>
                </div>

                {/* Cálculo Automático */}
                {litersCalculated > 0 && (
                  <div className="bg-primary/10 p-3 rounded-lg space-y-1">
                    <p className="text-sm font-semibold">📊 Cálculo Automático:</p>
                    <p className="text-sm">Peso consumido: {weightConsumed.toFixed(2)} kg</p>
                    <p className="text-sm font-bold text-primary">Litros abastecidos: {litersCalculated.toFixed(2)} L</p>
                  </div>
                )}
              </div>

              {/* Preço por Litro */}
              <div>
                <Label>Preço por Litro (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={pricePerLiter}
                  onChange={(e) => setPricePerLiter(e.target.value)}
                  placeholder="Ex: 6.50"
                  required
                />
                {budget?.lastPricePerLiter && (
                  <p className="text-xs text-muted-foreground mt-1">
                    💡 Preço atual do estoque: R$ {budget.lastPricePerLiter.toFixed(2)}
                  </p>
                )}
              </div>

              {/* Observações */}
              <div>
                <Label>Observações</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observações adicionais..."
                  rows={3}
                />
              </div>

              {/* Resumo de Valores */}
              {litersCalculated > 0 && pricePerLiter && (
                <div className="bg-muted p-4 rounded-lg space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Litros:</span>
                    <span className="font-semibold">{litersCalculated.toFixed(2)} L</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Preço/L:</span>
                    <span className="font-semibold">R$ {parseFloat(pricePerLiter).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Subtotal:</span>
                    <span className="font-semibold">R$ {subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Taxa:</span>
                    <span className="font-semibold">R$ {SERVICE_FEE.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Total:</span>
                    <span className="text-primary">R$ {totalCost}</span>
                  </div>
                </div>
              )}
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
              <Button type="submit" disabled={createMutation.isPending || uploadingPhotos}>
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Registrar Abastecimento
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
    </EmployeeDashboardLayout>
  );
}
