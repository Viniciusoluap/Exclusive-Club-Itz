import EmployeeDashboardLayout from "@/components/EmployeeDashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Plus, Settings, Trash2, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function EmployeeManutencoes() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [statusChangeId, setStatusChangeId] = useState<number | null>(null);
  const [newStatus, setNewStatus] = useState<string>("");
  const [formData, setFormData] = useState({
    vessel_id: "",
    start_date: "",
    end_date: "",
    description: "",
    status: "scheduled" as "scheduled" | "in_progress" | "completed" | "cancelled",
  });

  const { data: maintenances, isLoading, refetch } = trpc.maintenances.list.useQuery(undefined, {
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
  const { data: vessels } = trpc.vessels.list.useQuery();
  const createMutation = trpc.maintenances.create.useMutation();
  const updateMutation = trpc.maintenances.update.useMutation();
  const deleteMutation = trpc.maintenances.delete.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.vessel_id || !formData.start_date || !formData.end_date) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    try {
      // Converter datas para timestamp em milissegundos (timezone local)
      const [startYear, startMonth, startDay] = formData.start_date.split('-').map(Number);
      const [endYear, endMonth, endDay] = formData.end_date.split('-').map(Number);
      const startDate = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0).getTime();
      const endDate = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999).getTime();
      
      if (editingId) {
        const result = await updateMutation.mutateAsync({
          id: editingId,
          vesselId: parseInt(formData.vessel_id),
          startDate,
          endDate,
          description: formData.description,
          status: formData.status,
        });
        if (result.cancelledCount && result.cancelledCount > 0) {
          toast.success(`Manutenção atualizada! ${result.cancelledCount} reserva(s) cancelada(s).`);
        } else {
          toast.success("Manutenção atualizada com sucesso!");
        }
      } else {
        const result = await createMutation.mutateAsync({
          vesselId: parseInt(formData.vessel_id),
          startDate,
          endDate,
          description: formData.description,
          status: formData.status,
        });
        if (result.cancelledCount && result.cancelledCount > 0) {
          toast.success(`Manutenção criada! ${result.cancelledCount} reserva(s) cancelada(s).`);
        } else {
          toast.success("Manutenção criada com sucesso!");
        }
      }
      setOpen(false);
      setEditingId(null);
      setFormData({
        vessel_id: "",
        start_date: "",
        end_date: "",
        description: "",
        status: "scheduled",
      });
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar manutenção");
    }
  };

  const handleEdit = (maintenance: any) => {
    setEditingId(maintenance.id);
    // Timestamp já está em milissegundos
    const startDate = new Date(maintenance.startDate);
    const endDate = new Date(maintenance.endDate);
    
    setFormData({
      vessel_id: maintenance.vesselId.toString(),
      start_date: startDate.toISOString().split("T")[0],
      end_date: endDate.toISOString().split("T")[0],
      description: maintenance.description || "",
      status: maintenance.status,
    });
    setOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      await deleteMutation.mutateAsync({ id: deleteId });
      toast.success("Manutenção excluída com sucesso!");
      setDeleteId(null);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao excluir manutenção");
    }
  };

  const handleStatusChange = async () => {
    if (!statusChangeId || !newStatus) return;

    try {
      const maintenance = maintenances?.find((m) => m.id === statusChangeId);
      if (!maintenance) return;

      await updateMutation.mutateAsync({
        id: statusChangeId,
        vesselId: maintenance.vesselId,
        startDate: maintenance.startDate,
        endDate: maintenance.endDate,
        description: maintenance.description || "",
        status: newStatus as any,
      });
      toast.success("Status atualizado com sucesso!");
      setStatusChangeId(null);
      setNewStatus("");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar status");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "scheduled":
        return "bg-yellow-100 text-yellow-800";
      case "in_progress":
        return "bg-blue-100 text-blue-800";
      case "completed":
        return "bg-green-100 text-green-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "scheduled":
        return "Agendada";
      case "in_progress":
        return "Em Andamento";
      case "completed":
        return "Concluída";
      case "cancelled":
        return "Cancelada";
      default:
        return status;
    }
  };

  const formatDate = (timestamp: number) => {
    // Timestamp já está em milissegundos, não precisa multiplicar
    const date = new Date(timestamp);
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  return (
    <EmployeeDashboardLayout>
      <div className="container py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Manutenções</h1>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nova Manutenção
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingId ? "Editar Manutenção" : "Nova Manutenção"}
                </DialogTitle>
                <DialogDescription>
                  {editingId
                    ? "Atualize as informações da manutenção. Se o período for alterado, reservas conflitantes serão canceladas automaticamente."
                    : "Agende uma nova manutenção para uma embarcação. Reservas conflitantes serão canceladas automaticamente."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="vessel">Embarcação *</Label>
                  <Select
                    value={formData.vessel_id}
                    onValueChange={(value) =>
                      setFormData({ ...formData, vessel_id: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma embarcação" />
                    </SelectTrigger>
                    <SelectContent>
                      {vessels?.map((vessel) => (
                        <SelectItem key={vessel.id} value={vessel.id.toString()}>
                          {vessel.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="start_date">Data de Início *</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) =>
                      setFormData({ ...formData, start_date: e.target.value })
                    }
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="end_date">Data de Término *</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={formData.end_date}
                    onChange={(e) =>
                      setFormData({ ...formData, end_date: e.target.value })
                    }
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Descreva o tipo de manutenção..."
                    rows={3}
                  />
                </div>

                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value: any) =>
                      setFormData({ ...formData, status: value })
                    }
                  >
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

                <div className="flex gap-2">
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="flex-1"
                  >
                    {createMutation.isPending || updateMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      "Salvar"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setOpen(false);
                      setEditingId(null);
                      setFormData({
                        vessel_id: "",
                        start_date: "",
                        end_date: "",
                        description: "",
                        status: "scheduled",
                      });
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : maintenances && maintenances.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {maintenances.map((maintenance) => (
              <Card key={maintenance.id} className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-muted-foreground" />
                    <h3 className="font-semibold">{maintenance.vesselName}</h3>
                  </div>
                  <button
                    onClick={() => {
                      setStatusChangeId(maintenance.id);
                      setNewStatus(maintenance.status);
                    }}
                    className={`text-xs px-2 py-1 rounded-full cursor-pointer hover:opacity-80 transition-opacity ${getStatusColor(
                      maintenance.status
                    )}`}
                  >
                    {getStatusLabel(maintenance.status)}
                  </button>
                </div>

                <div className="space-y-2 text-sm mb-4">
                  {maintenance.createdByName && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="h-4 w-4" />
                      <span>
                        Requisitado por: <strong>{maintenance.createdByName}</strong>
                        {maintenance.createdByRole && (
                          <span className="text-xs ml-1">({maintenance.createdByRole === 'admin' ? 'Admin' : 'Funcionário'})</span>
                        )}
                      </span>
                    </div>
                  )}
                  
                  <div>
                    <span className="text-muted-foreground">Início:</span>{" "}
                    <strong>{formatDate(maintenance.startDate)}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Término:</span>{" "}
                    <strong>{formatDate(maintenance.endDate)}</strong>
                  </div>
                  {maintenance.description && (
                    <div>
                      <span className="text-muted-foreground">Descrição:</span>
                      <p className="mt-1">{maintenance.description}</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleEdit(maintenance)}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteId(maintenance.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma manutenção agendada</h3>
            <p className="text-muted-foreground mb-4">
              Clique em "Nova Manutenção" para agendar uma manutenção.
            </p>
          </Card>
        )}
      </div>

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta manutenção? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de alteração de status */}
      <Dialog open={!!statusChangeId} onOpenChange={() => setStatusChangeId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar Status da Manutenção</DialogTitle>
            <DialogDescription>
              Selecione o novo status para esta manutenção
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-status">Novo Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Agendada</SelectItem>
                  <SelectItem value="in_progress">Em Andamento</SelectItem>
                  <SelectItem value="completed">Concluída</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleStatusChange}
                disabled={updateMutation.isPending || !newStatus}
                className="flex-1"
              >
                {updateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Atualizando...
                  </>
                ) : (
                  "Atualizar"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStatusChangeId(null);
                  setNewStatus("");
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </EmployeeDashboardLayout>
  );
}
