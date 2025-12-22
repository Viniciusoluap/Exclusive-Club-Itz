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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Calendar, DollarSign, Edit, Loader2, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function CobrancasDanos() {
  const { user, loading: authLoading } = useAuth();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedCharge, setSelectedCharge] = useState<any>(null);
  const [formData, setFormData] = useState({
    inspectionId: "",
    amount: "",
    dueDate: "",
  });

  // Queries
  const { data: charges, isLoading, refetch } = trpc.inspectionCharges.listAll.useQuery();
  const { data: inspections } = trpc.inspections.list.useQuery({});

  // Mutations
  const createMutation = trpc.inspectionCharges.create.useMutation({
    onSuccess: () => {
      toast.success("Cobrança criada com sucesso!");
      setCreateDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao criar cobrança: ${error.message}`);
    },
  });

  const updateMutation = trpc.inspectionCharges.update.useMutation({
    onSuccess: () => {
      toast.success("Cobrança atualizada com sucesso!");
      setEditDialogOpen(false);
      setSelectedCharge(null);
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao atualizar cobrança: ${error.message}`);
    },
  });

  const deleteMutation = trpc.inspectionCharges.delete.useMutation({
    onSuccess: () => {
      toast.success("Cobrança cancelada com sucesso!");
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao cancelar cobrança: ${error.message}`);
    },
  });

  const resetForm = () => {
    setFormData({
      inspectionId: "",
      amount: "",
      dueDate: "",
    });
  };

  const handleCreate = () => {
    if (!formData.inspectionId || !formData.amount) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    const inspection = inspections?.find((i: any) => i.id === parseInt(formData.inspectionId));
    if (!inspection) {
      toast.error("Vistoria não encontrada");
      return;
    }

    // Extrair itens reprovados
    const failedItems = inspection.inspection_data.filter((item: any) => item.status === "Reprovado");

    createMutation.mutate({
      inspectionId: parseInt(formData.inspectionId),
      failedItems: failedItems.map((item: any) => ({
        name: item.name,
        status: item.status,
      })),
      amount: parseFloat(formData.amount),
      dueDate: formData.dueDate ? new Date(formData.dueDate).getTime() : undefined,
    });
  };

  const handleEdit = () => {
    if (!selectedCharge) return;

    updateMutation.mutate({
      chargeId: selectedCharge.id,
      newAmount: formData.amount ? parseFloat(formData.amount) : undefined,
      newDueDate: formData.dueDate ? new Date(formData.dueDate).getTime() : undefined,
    });
  };

  const handleDelete = (chargeId: number) => {
    if (confirm("Tem certeza que deseja cancelar esta cobrança?")) {
      deleteMutation.mutate({ chargeId });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string }> = {
      pending: { variant: "default", label: "Pendente" },
      paid: { variant: "default", label: "Pago" },
      overdue: { variant: "destructive", label: "Vencido" },
      cancelled: { variant: "secondary", label: "Cancelado" },
    };

    const config = variants[status] || variants.pending;
    return (
      <Badge
        variant={config.variant}
        className={
          status === "pending"
            ? "bg-yellow-500 hover:bg-yellow-600"
            : status === "paid"
            ? "bg-green-500 hover:bg-green-600"
            : ""
        }
      >
        {config.label}
      </Badge>
    );
  };

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Acesso Negado</CardTitle>
            <CardDescription>Apenas administradores podem acessar esta página.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Filtrar apenas vistorias reprovadas
  const rejectedInspections = inspections?.filter((i: any) => i.status === "rejected") || [];

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/admin">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Cobranças de Danos</h1>
            <p className="text-muted-foreground">
              Gerencie cobranças de reparos após vistorias reprovadas
            </p>
          </div>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Cobrança
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total de Cobranças</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{charges?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {charges?.filter((c: any) => c.payment_status === "pending").length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Pagas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {charges?.filter((c: any) => c.payment_status === "paid").length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R${" "}
              {charges
                ?.filter((c: any) => c.payment_status !== "cancelled")
                .reduce((sum: number, c: any) => sum + parseFloat(c.amount), 0)
                .toFixed(2) || "0.00"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charges Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Cobranças</CardTitle>
          <CardDescription>Visualize e gerencie todas as cobranças de danos</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : charges && charges.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4">ID</th>
                    <th className="text-left py-3 px-4">Data</th>
                    <th className="text-left py-3 px-4">Cliente</th>
                    <th className="text-left py-3 px-4">Embarcação</th>
                    <th className="text-left py-3 px-4">Valor</th>
                    <th className="text-left py-3 px-4">Vencimento</th>
                    <th className="text-left py-3 px-4">Status</th>
                    <th className="text-left py-3 px-4">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {charges.map((charge: any) => (
                    <tr key={charge.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4">#{charge.id}</td>
                      <td className="py-3 px-4">
                        {new Date(charge.created_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="py-3 px-4">{charge.client_email}</td>
                      <td className="py-3 px-4">{charge.vessel_name}</td>
                      <td className="py-3 px-4 font-semibold">
                        R$ {parseFloat(charge.amount).toFixed(2)}
                      </td>
                      <td className="py-3 px-4">
                        {new Date(charge.due_date).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="py-3 px-4">{getStatusBadge(charge.payment_status)}</td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          {charge.payment_status !== "paid" &&
                            charge.payment_status !== "cancelled" && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setSelectedCharge(charge);
                                    setFormData({
                                      inspectionId: charge.inspection_id.toString(),
                                      amount: charge.amount,
                                      dueDate: new Date(charge.due_date)
                                        .toISOString()
                                        .split("T")[0],
                                    });
                                    setEditDialogOpen(true);
                                  }}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDelete(charge.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              Nenhuma cobrança cadastrada ainda.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Cobrança de Danos</DialogTitle>
            <DialogDescription>
              Cadastre uma cobrança após orçamento aprovado pelo cliente
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="inspection">Vistoria Reprovada *</Label>
              <Select
                value={formData.inspectionId}
                onValueChange={(value) => setFormData({ ...formData, inspectionId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma vistoria" />
                </SelectTrigger>
                <SelectContent>
                  {rejectedInspections.length > 0 ? (
                    rejectedInspections.map((inspection: any) => (
                      <SelectItem key={inspection.id} value={inspection.id.toString()}>
                        {inspection.vessel_name} - {inspection.client_name} -{" "}
                        {new Date(inspection.created_at).toLocaleDateString("pt-BR")}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>
                      Nenhuma vistoria reprovada disponível
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Valor Total (R$) *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                placeholder="Ex: 150.00"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Data de Vencimento (opcional)</Label>
              <Input
                id="dueDate"
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Padrão: 7 dias após criação da cobrança
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                "Criar Cobrança"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Cobrança</DialogTitle>
            <DialogDescription>
              Atualize o valor ou prorrogue a data de vencimento
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-amount">Novo Valor (R$)</Label>
              <Input
                id="edit-amount"
                type="number"
                step="0.01"
                placeholder="Ex: 150.00"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-dueDate">Nova Data de Vencimento</Label>
              <Input
                id="edit-dueDate"
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar Alterações"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
