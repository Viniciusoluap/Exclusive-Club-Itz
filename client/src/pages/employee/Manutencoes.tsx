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
import { Loader2, Plus, Settings } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function EmployeeManutencoes() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    vessel_id: "",
    start_date: "",
    end_date: "",
    description: "",
    status: "scheduled" as "scheduled" | "in_progress" | "completed" | "cancelled",
  });

  const { data: maintenances, isLoading, refetch } = trpc.maintenances.list.useQuery();
  const { data: vessels } = trpc.vessels.list.useQuery();
  const createMutation = trpc.maintenances.create.useMutation();
  const updateMutation = trpc.maintenances.update.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.vessel_id || !formData.start_date || !formData.end_date) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          ...formData,
          vessel_id: parseInt(formData.vessel_id),
        });
        toast.success("Manutenção atualizada com sucesso!");
      } else {
        await createMutation.mutateAsync({
          ...formData,
          vessel_id: parseInt(formData.vessel_id),
        });
        toast.success("Manutenção criada com sucesso!");
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
    setFormData({
      vessel_id: maintenance.vessel_id.toString(),
      start_date: new Date(maintenance.start_date).toISOString().split("T")[0],
      end_date: new Date(maintenance.end_date).toISOString().split("T")[0],
      description: maintenance.description || "",
      status: maintenance.status,
    });
    setOpen(true);
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
                    ? "Atualize as informações da manutenção"
                    : "Agende uma nova manutenção para uma embarcação"}
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
                    <h3 className="font-semibold">{maintenance.vessel_name}</h3>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${getStatusColor(
                      maintenance.status
                    )}`}
                  >
                    {getStatusLabel(maintenance.status)}
                  </span>
                </div>

                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Início:</span>{" "}
                    {new Date(maintenance.start_date).toLocaleDateString("pt-BR")}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Término:</span>{" "}
                    {new Date(maintenance.end_date).toLocaleDateString("pt-BR")}
                  </div>
                  {maintenance.description && (
                    <div>
                      <span className="text-muted-foreground">Descrição:</span>
                      <p className="mt-1">{maintenance.description}</p>
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => handleEdit(maintenance)}
                  >
                    Editar
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
    </EmployeeDashboardLayout>
  );
}
