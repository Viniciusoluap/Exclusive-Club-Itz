import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Calendar, Loader2, Pencil, Plus, Settings, Trash2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";

export default function AdminManutencao() {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  // Create dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictingBookings, setConflictingBookings] = useState<any[]>([]);
  const [selectedVesselId, setSelectedVesselId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"scheduled" | "in_progress" | "completed" | "cancelled">("scheduled");
  
  // Edit dialog state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingMaintenance, setEditingMaintenance] = useState<any>(null);
  const [editVesselId, setEditVesselId] = useState<number | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState<"scheduled" | "in_progress" | "completed" | "cancelled">("scheduled");
  
  // Usar refs para inputs de data (uncontrolled)
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);
  const editStartDateRef = useRef<HTMLInputElement>(null);
  const editEndDateRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  // Fetch data
  const { data: vessels, refetch: refetchVessels } = trpc.vessels.listAll.useQuery(undefined, {
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });
  
  // @ts-ignore - maintenances router exists but TypeScript types not regenerated
  const { data: maintenances, isLoading: maintenancesLoading } = trpc.maintenances.list.useQuery();

  // Mutations
  // @ts-ignore - maintenances router exists but TypeScript types not regenerated
  const createMaintenance = trpc.maintenances.create.useMutation({
    onSuccess: (data: any) => {
      if (data.cancelledCount > 0) {
        toast.success(`Manutenção criada! ${data.cancelledCount} reserva(s) cancelada(s).`);
      } else {
        toast.success("Manutenção criada com sucesso!");
      }
      // @ts-ignore
      utils.maintenances.list.invalidate();
      setShowCreateDialog(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar manutenção");
    },
  });

  // @ts-ignore - maintenances router exists but TypeScript types not regenerated
  const deleteMaintenance = trpc.maintenances.delete.useMutation({
    onSuccess: () => {
      toast.success("Manutenção excluída com sucesso!");
      // @ts-ignore
      utils.maintenances.list.invalidate();
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir manutenção");
    },
  });

  // @ts-ignore - maintenances router exists but TypeScript types not regenerated
  const updateMaintenance = trpc.maintenances.update.useMutation({
    onSuccess: (data: any) => {
      if (data.cancelledCount > 0) {
        toast.success(`Manutenção atualizada! ${data.cancelledCount} reserva(s) cancelada(s).`);
      } else {
        toast.success("Manutenção atualizada com sucesso!");
      }
      // @ts-ignore
      utils.maintenances.list.invalidate();
      setShowEditDialog(false);
      setEditingMaintenance(null);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar manutenção");
    },
  });

  // Check authentication and admin role
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== "admin") {
    setLocation("/");
    return null;
  }

  const resetForm = () => {
    setSelectedVesselId(null);
    if (startDateRef.current) startDateRef.current.value = '';
    if (endDateRef.current) endDateRef.current.value = '';
    setDescription("");
    setStatus("scheduled");
  };

  const handleCreateMaintenance = () => {
    const startDate = startDateRef.current?.value || '';
    const endDate = endDateRef.current?.value || '';
    
    if (!selectedVesselId || !startDate || !endDate) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    
    if (typeof selectedVesselId !== 'number' || selectedVesselId <= 0) {
      toast.error("Selecione uma embarcação válida");
      return;
    }

    // Converter data para timestamp UTC (início do dia para startDate, fim do dia para endDate)
    // Usar Date.UTC para evitar problemas de timezone
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    
    const startTimestamp = Date.UTC(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
    const endTimestamp = Date.UTC(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

    if (startTimestamp >= endTimestamp) {
      toast.error("Data de início deve ser anterior à data de término");
      return;
    }

    createMaintenance.mutate({
      vesselId: selectedVesselId,
      startDate: startTimestamp,
      endDate: endTimestamp,
      description: description || undefined,
      status,
    });
  };

  const confirmCreateMaintenance = () => {
    const startDate = startDateRef.current?.value || '';
    const endDate = endDateRef.current?.value || '';
    
    if (!selectedVesselId || !startDate || !endDate) return;

    const startTimestamp = new Date(startDate + 'T00:00:00').getTime();
    const endTimestamp = new Date(endDate + 'T23:59:59').getTime();

    createMaintenance.mutate({
      vesselId: selectedVesselId,
      startDate: startTimestamp,
      endDate: endTimestamp,
      description: description || undefined,
      status,
    });
    setShowConflictDialog(false);
  };

  const handleDelete = (id: number) => {
    if (confirm("Tem certeza que deseja excluir esta manutenção?")) {
      deleteMaintenance.mutate({ id });
    }
  };

  const handleStatusChange = (id: number, newStatus: "scheduled" | "in_progress" | "completed" | "cancelled") => {
    updateMaintenance.mutate({ id, status: newStatus });
  };

  const handleOpenEditDialog = (maintenance: any) => {
    setEditingMaintenance(maintenance);
    setEditVesselId(maintenance.vesselId);
    setEditDescription(maintenance.description || "");
    setEditStatus(maintenance.status);
    setShowEditDialog(true);
    
    // Definir valores das datas após o dialog abrir
    setTimeout(() => {
      if (editStartDateRef.current) {
        const startDate = new Date(maintenance.startDate);
        editStartDateRef.current.value = startDate.toISOString().split('T')[0];
      }
      if (editEndDateRef.current) {
        const endDate = new Date(maintenance.endDate);
        editEndDateRef.current.value = endDate.toISOString().split('T')[0];
      }
    }, 100);
  };

  const handleEditMaintenance = () => {
    if (!editingMaintenance) return;
    
    const startDate = editStartDateRef.current?.value || '';
    const endDate = editEndDateRef.current?.value || '';
    
    if (!editVesselId || !startDate || !endDate) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    // Converter data para timestamp UTC (início do dia para startDate, fim do dia para endDate)
    // Usar Date.UTC para evitar problemas de timezone
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    
    const startTimestamp = Date.UTC(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
    const endTimestamp = Date.UTC(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

    if (startTimestamp >= endTimestamp) {
      toast.error("Data de início deve ser anterior à data de término");
      return;
    }

    updateMaintenance.mutate({
      id: editingMaintenance.id,
      vesselId: editVesselId,
      startDate: startTimestamp,
      endDate: endTimestamp,
      description: editDescription || undefined,
      status: editStatus,
    });
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    };
    const labels = {
      scheduled: "Agendada",
      in_progress: "Em Andamento",
      completed: "Concluída",
      cancelled: "Cancelada",
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badges[status as keyof typeof badges]}`}>
        {labels[status as keyof typeof labels]}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin">
              <Button variant="ghost" size="sm">
                ← Voltar
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">Calendário de Manutenção</h1>
            </div>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Manutenção
          </Button>
        </div>
      </header>

      {/* Content */}
      <div className="container py-8">
        <Card>
          <CardHeader>
            <CardTitle>Manutenções Programadas</CardTitle>
            <CardDescription>
              Gerencie os períodos de manutenção das embarcações. Reservas são bloqueadas automaticamente durante estes períodos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {maintenancesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : maintenances && maintenances.length > 0 ? (
              <div className="space-y-4">
                {maintenances.map((maintenance: any) => (
                  <div
                    key={maintenance.id}
                    className="flex items-start justify-between p-4 border border-border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{maintenance.vesselName}</span>
                        {getStatusBadge(maintenance.status)}
                      </div>
                      <div className="text-sm text-muted-foreground ml-7">
                        {maintenance.createdByName && (
                          <p>
                            <strong>Requisitado por:</strong> {maintenance.createdByName}
                            {maintenance.createdByRole && (
                              <span className="text-xs ml-1">({maintenance.createdByRole === 'admin' ? 'Admin' : 'Funcionário'})</span>
                            )}
                          </p>
                        )}
                        <p>
                          <strong>Início:</strong> {new Date(maintenance.startDate).toLocaleDateString("pt-BR")}
                        </p>
                        <p>
                          <strong>Término:</strong> {new Date(maintenance.endDate).toLocaleDateString("pt-BR")}
                        </p>
                        {maintenance.description && (
                          <p className="mt-2">
                            <strong>Descrição:</strong> {maintenance.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Select
                        value={maintenance.status}
                        onValueChange={(value) => handleStatusChange(maintenance.id, value as any)}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scheduled">Agendada</SelectItem>
                          <SelectItem value="in_progress">Em Andamento</SelectItem>
                          <SelectItem value="completed">Concluída</SelectItem>
                          <SelectItem value="cancelled">Cancelada</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEditDialog(maintenance)}
                        title="Editar manutenção"
                      >
                        <Pencil className="h-4 w-4 text-blue-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(maintenance.id)}
                        disabled={deleteMaintenance.isPending}
                        title="Excluir manutenção"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma manutenção programada</p>
                <p className="text-sm mt-2">Clique em "Nova Manutenção" para adicionar</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Nova Manutenção</DialogTitle>
            <DialogDescription>
              Programe um período de manutenção para uma embarcação. Reservas conflitantes serão canceladas automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Embarcação *</label>
              <Select
                value={selectedVesselId?.toString() || ""}
                onValueChange={(value) => {
                  const parsed = parseInt(value);
                  if (!isNaN(parsed) && parsed > 0) {
                    setSelectedVesselId(parsed);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma embarcação" />
                </SelectTrigger>
                <SelectContent>
                  {vessels && vessels.length > 0 ? (
                    vessels.map((vessel: any) => (
                      <SelectItem key={vessel.id} value={vessel.id.toString()}>
                        {vessel.name}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-2 text-sm text-muted-foreground">Nenhuma embarcação disponível</div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Data Início *</label>
                <input
                  ref={startDateRef}
                  type="date"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Data Término *</label>
                <input
                  ref={endDateRef}
                  type="date"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={status} onValueChange={(value: any) => setStatus(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Agendada</SelectItem>
                  <SelectItem value="in_progress">Em Andamento</SelectItem>
                  <SelectItem value="completed">Concluída</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Descrição (opcional)</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Troca de óleo, revisão de motor, etc."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateMaintenance} disabled={createMaintenance.isPending}>
              {createMaintenance.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
                "Criar Manutenção"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Editar Manutenção</DialogTitle>
            <DialogDescription>
              Edite os dados da manutenção. Se o período for alterado, reservas conflitantes serão canceladas automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Embarcação *</label>
              <Select
                value={editVesselId?.toString() || ""}
                onValueChange={(value) => {
                  const parsed = parseInt(value);
                  if (!isNaN(parsed) && parsed > 0) {
                    setEditVesselId(parsed);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma embarcação" />
                </SelectTrigger>
                <SelectContent>
                  {vessels && vessels.length > 0 ? (
                    vessels.map((vessel: any) => (
                      <SelectItem key={vessel.id} value={vessel.id.toString()}>
                        {vessel.name}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-2 text-sm text-muted-foreground">Nenhuma embarcação disponível</div>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Data Início *</label>
                <input
                  ref={editStartDateRef}
                  type="date"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Data Término *</label>
                <input
                  ref={editEndDateRef}
                  type="date"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={editStatus} onValueChange={(value: any) => setEditStatus(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Agendada</SelectItem>
                  <SelectItem value="in_progress">Em Andamento</SelectItem>
                  <SelectItem value="completed">Concluída</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Descrição (opcional)</label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Ex: Troca de óleo, revisão de motor, etc."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEditMaintenance} disabled={updateMaintenance.isPending}>
              {updateMaintenance.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar Alterações"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Confirmação de Conflitos */}
      <Dialog open={showConflictDialog} onOpenChange={setShowConflictDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-destructive">Atenção: Reservas Conflitantes</DialogTitle>
            <DialogDescription>
              O período selecionado possui reservas ativas que serão automaticamente canceladas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border p-4 bg-muted/50">
              <h4 className="font-semibold mb-3 text-sm">Reservas que serão canceladas:</h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {conflictingBookings.map((booking, index) => (
                  <div key={index} className="flex items-start justify-between p-3 bg-background rounded border">
                    <div className="space-y-1">
                      <div className="font-medium text-sm">{booking.clientName}</div>
                      <div className="text-xs text-muted-foreground">{booking.clientEmail}</div>
                      <div className="text-xs text-muted-foreground">
                        {booking.vesselName} •{" "}
                        {new Date(booking.bookingDate).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              Total de reservas afetadas: <strong>{conflictingBookings.length}</strong>
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConflictDialog(false)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmCreateMaintenance}
              disabled={createMaintenance.isPending}
            >
              {createMaintenance.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando...
                </>
              ) : (
                "Confirmar e Cancelar Reservas"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
