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
import { Fuel, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function EmployeeAbastecimentos() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    vessel_id: "",
    date: "",
    liters: "",
    cost: "",
    notes: "",
  });

  const { data: refuelings, isLoading, refetch } = trpc.refueling.list.useQuery();
  const { data: vessels } = trpc.vessels.list.useQuery();
  const createMutation = trpc.refueling.create.useMutation();
  const updateMutation = trpc.refueling.update.useMutation();
  const deleteMutation = trpc.refueling.delete.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.vessel_id || !formData.date || !formData.liters || !formData.cost) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    try {
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          ...formData,
          vessel_id: parseInt(formData.vessel_id),
          liters: parseFloat(formData.liters),
          cost: parseFloat(formData.cost),
        });
        toast.success("Abastecimento atualizado com sucesso!");
      } else {
        await createMutation.mutateAsync({
          ...formData,
          vessel_id: parseInt(formData.vessel_id),
          liters: parseFloat(formData.liters),
          cost: parseFloat(formData.cost),
        });
        toast.success("Abastecimento registrado com sucesso!");
      }
      setOpen(false);
      setEditingId(null);
      setFormData({
        vessel_id: "",
        date: "",
        liters: "",
        cost: "",
        notes: "",
      });
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar abastecimento");
    }
  };

  const handleEdit = (refueling: any) => {
    setEditingId(refueling.id);
    setFormData({
      vessel_id: refueling.vessel_id.toString(),
      date: new Date(refueling.date).toISOString().split("T")[0],
      liters: refueling.liters.toString(),
      cost: refueling.cost.toString(),
      notes: refueling.notes || "",
    });
    setOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Tem certeza que deseja excluir este abastecimento?")) return;

    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Abastecimento excluído com sucesso!");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao excluir abastecimento");
    }
  };

  return (
    <EmployeeDashboardLayout>
      <div className="container py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Abastecimentos</h1>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Novo Abastecimento
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingId ? "Editar Abastecimento" : "Novo Abastecimento"}
                </DialogTitle>
                <DialogDescription>
                  {editingId
                    ? "Atualize as informações do abastecimento"
                    : "Registre um novo abastecimento de embarcação"}
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
                  <Label htmlFor="liters">Litros *</Label>
                  <Input
                    id="liters"
                    type="number"
                    step="0.01"
                    value={formData.liters}
                    onChange={(e) =>
                      setFormData({ ...formData, liters: e.target.value })
                    }
                    placeholder="Ex: 150.5"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="cost">Custo (R$) *</Label>
                  <Input
                    id="cost"
                    type="number"
                    step="0.01"
                    value={formData.cost}
                    onChange={(e) =>
                      setFormData({ ...formData, cost: e.target.value })
                    }
                    placeholder="Ex: 850.00"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="notes">Observações</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                    placeholder="Informações adicionais..."
                    rows={3}
                  />
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
                        date: "",
                        liters: "",
                        cost: "",
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
        ) : refuelings && refuelings.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {refuelings.map((refueling) => (
              <Card key={refueling.id} className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Fuel className="h-5 w-5 text-muted-foreground" />
                    <h3 className="font-semibold">{refueling.vessel_name}</h3>
                  </div>
                </div>

                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Data:</span>{" "}
                    {new Date(refueling.date).toLocaleDateString("pt-BR")}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Litros:</span>{" "}
                    {refueling.liters.toFixed(2)} L
                  </div>
                  <div>
                    <span className="text-muted-foreground">Custo:</span>{" "}
                    R$ {refueling.cost.toFixed(2)}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Custo/Litro:</span>{" "}
                    R$ {(refueling.cost / refueling.liters).toFixed(2)}
                  </div>
                  {refueling.notes && (
                    <div>
                      <span className="text-muted-foreground">Observações:</span>
                      <p className="mt-1">{refueling.notes}</p>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleEdit(refueling)}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => handleDelete(refueling.id)}
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
            <Fuel className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum abastecimento registrado</h3>
            <p className="text-muted-foreground mb-4">
              Clique em "Novo Abastecimento" para registrar um abastecimento.
            </p>
          </Card>
        )}
      </div>
    </EmployeeDashboardLayout>
  );
}
