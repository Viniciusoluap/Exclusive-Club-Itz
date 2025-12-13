import EmployeeDashboardLayout from "@/components/EmployeeDashboardLayout";
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
import { Loader2, Plus, Fuel, TrendingUp, ArrowLeft, Trash2, FileText, Mail } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Link } from "wouter";

export default function EmployeeAbastecimentos() {
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

  const trpcAny = trpc as any;
  const { data: recentBookings } = trpcAny.bookings?.getRecent.useQuery({ onlyUsed: true }) || { data: [] }; // Busca apenas as últimas 6 reservas utilizadas
  const { data: fuelRecords, refetch } = trpcAny.fuelRecords?.list.useQuery({}) || { data: [] };
  const { data: vessels } = trpc.vessels.list.useQuery();

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

  const resetForm = () => {
    setSelectedBookingId(null);
    setLiters("");
    setPricePerLiter("");
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

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedBookingId) {
      toast.error("Selecione uma reserva");
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
      liters: parseFloat(liters),
      pricePerLiter: parseFloat(pricePerLiter),
      notes: notes || undefined,
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
    <EmployeeDashboardLayout>
      <div className="container py-8">
      <div className="mb-6">
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
                      </div>
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
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Registrar
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
