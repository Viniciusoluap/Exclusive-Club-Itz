import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, DollarSign, Plus, Pencil, X, RefreshCw, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";

export default function Saas() {
  const [, setLocation] = useLocation();
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<"active" | "paused" | "cancelled" | "all">("active");
  
  const [form, setForm] = useState({
    clientId: 0,
    type: "monthly" as "monthly" | "quota_sale",
    value: "",
    dueDay: "10",
    startDate: new Date().toISOString().split('T')[0],
    endDate: "",
    yearlyAdjustment: "manual" as "manual" | "ipca" | "igpm",
  });

  const utils = trpc.useUtils();
  const { data: subscriptions, isLoading } = trpc.saas.list.useQuery({ status: statusFilter });
  const { data: clients } = trpc.allowedClients.list.useQuery();
  const { data: dashboard } = trpc.saas.getInvoiceDashboard.useQuery();

  const createMutation = trpc.saas.create.useMutation({
    onSuccess: () => {
      toast.success("Mensalidade criada com sucesso!");
      utils.saas.list.invalidate();
      utils.saas.getInvoiceDashboard.invalidate();
      setShowDialog(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateMutation = trpc.saas.update.useMutation({
    onSuccess: () => {
      toast.success("Mensalidade atualizada com sucesso!");
      utils.saas.list.invalidate();
      utils.saas.getInvoiceDashboard.invalidate();
      setShowDialog(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const cancelMutation = trpc.saas.cancel.useMutation({
    onSuccess: () => {
      toast.success("Mensalidade cancelada com sucesso!");
      utils.saas.list.invalidate();
      utils.saas.getInvoiceDashboard.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const syncMutation = trpc.saas.syncWithAsaas.useMutation({
    onSuccess: (data) => {
      toast.success(`Sincronizado! ${data.syncedCount} cobranças atualizadas.`);
      utils.saas.getInvoiceDashboard.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setForm({
      clientId: 0,
      type: "monthly",
      value: "",
      dueDay: "10",
      startDate: new Date().toISOString().split('T')[0],
      endDate: "",
      yearlyAdjustment: "manual",
    });
    setEditingId(null);
  };

  const handleSubmit = () => {
    if (!form.clientId || !form.value || !form.dueDay) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    const data = {
      clientId: form.clientId,
      type: form.type,
      value: parseFloat(form.value),
      dueDay: parseInt(form.dueDay),
      startDate: form.startDate,
      endDate: form.endDate || undefined,
      yearlyAdjustment: form.yearlyAdjustment,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (subscription: any) => {
    setEditingId(subscription.subscription.id);
    setForm({
      clientId: subscription.subscription.clientId,
      type: subscription.subscription.type,
      value: subscription.subscription.value,
      dueDay: subscription.subscription.dueDay.toString(),
      startDate: subscription.subscription.startDate.split('T')[0],
      endDate: subscription.subscription.endDate ? subscription.subscription.endDate.split('T')[0] : "",
      yearlyAdjustment: subscription.subscription.yearlyAdjustment,
    });
    setShowDialog(true);
  };

  const handleCancel = (id: number) => {
    if (confirm("Tem certeza que deseja cancelar esta mensalidade?")) {
      cancelMutation.mutate({ id });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => setLocation("/admin")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Saas - Mensalidades</h1>
            <p className="text-sm text-gray-600">Gestão de mensalidades e vendas de cotas</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            Sincronizar Asaas
          </Button>
          <Button onClick={() => { resetForm(); setShowDialog(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Mensalidade
          </Button>
        </div>
      </div>

      {/* Dashboard de Inadimplência */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Esperado</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {dashboard?.totalExpected.toFixed(2) || "0,00"}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recebido</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              R$ {dashboard?.totalPaid.toFixed(2) || "0,00"}
            </div>
            <p className="text-xs text-muted-foreground">
              {dashboard?.paidCount || 0} cobrança(s)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendente</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              R$ {dashboard?.totalPending.toFixed(2) || "0,00"}
            </div>
            <p className="text-xs text-muted-foreground">
              {dashboard?.pendingCount || 0} cobrança(s)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Vencido</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              R$ {dashboard?.totalOverdue.toFixed(2) || "0,00"}
            </div>
            <p className="text-xs text-muted-foreground">
              {dashboard?.overdueCount || 0} cobrança(s)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button
              variant={statusFilter === "all" ? "default" : "outline"}
              onClick={() => setStatusFilter("all")}
            >
              Todas
            </Button>
            <Button
              variant={statusFilter === "active" ? "default" : "outline"}
              onClick={() => setStatusFilter("active")}
            >
              Ativas
            </Button>
            <Button
              variant={statusFilter === "paused" ? "default" : "outline"}
              onClick={() => setStatusFilter("paused")}
            >
              Pausadas
            </Button>
            <Button
              variant={statusFilter === "cancelled" ? "default" : "outline"}
              onClick={() => setStatusFilter("cancelled")}
            >
              Canceladas
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Mensalidades */}
      <Card>
        <CardHeader>
          <CardTitle>Mensalidades Cadastradas</CardTitle>
          <CardDescription>
            {subscriptions?.length || 0} mensalidade(s) encontrada(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground">Carregando...</p>
          ) : subscriptions && subscriptions.length > 0 ? (
            <div className="space-y-4">
              {subscriptions.map((item) => (
                <div
                  key={item.subscription.id}
                  className="flex flex-col md:flex-row md:items-center md:justify-between p-4 border rounded-lg gap-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{item.client?.name || "Cliente não encontrado"}</h3>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        item.subscription.status === "active" ? "bg-green-100 text-green-700" :
                        item.subscription.status === "paused" ? "bg-yellow-100 text-yellow-700" :
                        "bg-red-100 text-red-700"
                      }`}>
                        {item.subscription.status === "active" ? "Ativa" :
                         item.subscription.status === "paused" ? "Pausada" : "Cancelada"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{item.client?.email}</p>
                    <div className="flex flex-wrap gap-4 mt-2 text-sm">
                      <span>
                        <strong>Tipo:</strong> {item.subscription.type === "monthly" ? "Mensalidade" : "Venda de Cota"}
                      </span>
                      <span>
                        <strong>Valor:</strong> R$ {parseFloat(item.subscription.value).toFixed(2)}
                      </span>
                      <span>
                        <strong>Vencimento:</strong> Dia {item.subscription.dueDay}
                      </span>
                      <span>
                        <strong>Reajuste:</strong> {
                          item.subscription.yearlyAdjustment === "manual" ? "Manual" :
                          item.subscription.yearlyAdjustment === "ipca" ? "IPCA" : "IGP-M"
                        }
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleEdit(item)}
                      disabled={item.subscription.status === "cancelled"}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleCancel(item.subscription.id)}
                      disabled={item.subscription.status === "cancelled"}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground">Nenhuma mensalidade cadastrada</p>
          )}
        </CardContent>
      </Card>

      {/* Dialog de Criar/Editar */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Mensalidade" : "Nova Mensalidade"}</DialogTitle>
            <DialogDescription>
              Preencha os dados da mensalidade
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Cliente *</Label>
              <Select
                value={form.clientId.toString()}
                onValueChange={(value) => setForm({ ...form, clientId: parseInt(value) })}
                disabled={!!editingId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients?.map((client) => (
                    <SelectItem key={client.id} value={client.id.toString()}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Tipo *</Label>
              <Select
                value={form.type}
                onValueChange={(value: "monthly" | "quota_sale") => setForm({ ...form, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensalidade</SelectItem>
                  <SelectItem value="quota_sale">Venda de Cota</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Valor (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                placeholder="0.00"
              />
            </div>

            <div>
              <Label>Dia do Vencimento *</Label>
              <Input
                type="number"
                min="1"
                max="31"
                value={form.dueDay}
                onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
              />
            </div>

            <div>
              <Label>Data de Início *</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </div>

            <div>
              <Label>Data de Término (opcional)</Label>
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </div>

            <div>
              <Label>Reajuste Anual</Label>
              <Select
                value={form.yearlyAdjustment}
                onValueChange={(value: "manual" | "ipca" | "igpm") => setForm({ ...form, yearlyAdjustment: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="ipca">IPCA</SelectItem>
                  <SelectItem value="igpm">IGP-M</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}>
              {editingId ? "Atualizar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
