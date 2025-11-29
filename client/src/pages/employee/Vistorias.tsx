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
import { ClipboardCheck, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function EmployeeVistorias() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    vessel_id: "",
    date: "",
    inspector_name: "",
    status: "approved" as "approved" | "rejected" | "pending",
    notes: "",
  });

  const { data: inspections, isLoading, refetch } = trpc.inspections.list.useQuery({});
  const { data: vessels } = trpc.vessels.list.useQuery();
  const createMutation = trpc.inspections.create.useMutation();
  const deleteMutation = trpc.inspections.delete.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.vessel_id || !formData.date || !formData.inspector_name) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    try {
      // Nota: Edição de vistorias não está implementada no backend
      // Por enquanto, apenas criação está disponível
      if (editingId) {
        toast.error("Edição de vistorias não está disponível. Por favor, exclua e crie uma nova.");
        return;
      }
      
      // TODO: Implementar lógica correta de criação com os campos do schema
      // Campos necessários: bookingId, vesselId, vesselType, clientName, formData, observations
      toast.error("Funcionalidade em desenvolvimento. Use o formulário de vistoria completo.");
      return;
      // setOpen(false);
      // setEditingId(null);
      // setFormData({
      //   vessel_id: "",
      //   date: "",
      //   inspector_name: "",
      //   status: "approved",
      //   notes: "",
      // });
      // refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar vistoria");
    }
  };

  const handleEdit = (inspection: { id: number; vessel_id: string; date: string; inspector_name: string; status: string; notes: string }) => {
    setEditingId(inspection.id);
    setFormData({
      vessel_id: inspection.vessel_id.toString(),
      date: new Date(inspection.date).toISOString().split("T")[0],
      inspector_name: inspection.inspector_name,
      status: inspection.status as "approved" | "rejected" | "pending",
      notes: inspection.notes || "",
    });
    setOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir esta vistoria?")) return;

    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Vistoria excluída com sucesso!");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao excluir vistoria");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-green-100 text-green-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "approved":
        return "Aprovada";
      case "rejected":
        return "Reprovada";
      case "pending":
        return "Pendente";
      default:
        return status;
    }
  };

  return (
    <EmployeeDashboardLayout>
      <div className="container py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Vistorias</h1>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nova Vistoria
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingId ? "Editar Vistoria" : "Nova Vistoria"}
                </DialogTitle>
                <DialogDescription>
                  {editingId
                    ? "Atualize as informações da vistoria"
                    : "Registre uma nova vistoria de embarcação"}
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
                  <Label htmlFor="date">Data *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) =>
                      setFormData({ ...formData, date: e.target.value })
                    }
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="inspector_name">Vistoriador *</Label>
                  <Input
                    id="inspector_name"
                    type="text"
                    value={formData.inspector_name}
                    onChange={(e) =>
                      setFormData({ ...formData, inspector_name: e.target.value })
                    }
                    placeholder="Nome do vistoriador"
                    required
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
                      <SelectItem value="approved">Aprovada</SelectItem>
                      <SelectItem value="rejected">Reprovada</SelectItem>
                      <SelectItem value="pending">Pendente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="notes">Observações</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    placeholder="Detalhes da vistoria..."
                    rows={3}
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    type="submit"
                    disabled={createMutation.isPending}
                    className="flex-1"
                  >
                    {createMutation.isPending ? (
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
                        date: "",
                        inspector_name: "",
                        status: "approved",
                        notes: "",
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
        ) : inspections && inspections.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {inspections.map((inspection: any) => (
              <Card key={inspection.id} className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
                    <h3 className="font-semibold">{inspection.vessel_name}</h3>
                  </div>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${getStatusColor(
                      inspection.status
                    )}`}
                  >
                    {getStatusLabel(inspection.status)}
                  </span>
                </div>

                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Data:</span>{" "}
                    {new Date(inspection.date).toLocaleDateString("pt-BR")}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Vistoriador:</span>{" "}
                    {inspection.inspector_name}
                  </div>
                  {inspection.notes && (
                    <div>
                      <span className="text-muted-foreground">Observações:</span>
                      <p className="mt-1">{inspection.notes}</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleEdit(inspection)}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => handleDelete(inspection.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhuma vistoria registrada</h3>
            <p className="text-muted-foreground mb-4">
              Clique em "Nova Vistoria" para registrar uma vistoria.
            </p>
          </Card>
        )}
      </div>
    </EmployeeDashboardLayout>
  );
}
