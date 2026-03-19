import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, DollarSign, Plus, Pencil, X, RefreshCw, TrendingUp, TrendingDown, AlertCircle, CheckCircle, MessageCircle, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import { formatCurrency } from "@/lib/formatCurrency";

// Componente para listar e classificar cobranças não classificadas
function UnclassifiedChargesSection() {
  const [selectedClient, setSelectedClient] = useState<Record<string, number>>({});
  const [selectedType, setSelectedType] = useState<Record<string, "monthly" | "quota_sale" | "fuel" | "repair" | "other">>({}); 
  // Nota: as chaves dos dicionários são asaasChargeId (string)
  
  const utils = trpc.useUtils();
  const { data: unclassified, isLoading } = trpc.saas.listUnclassifiedCharges.useQuery();
  const { data: clients } = trpc.allowedClients.list.useQuery();
  
  const classifyMutation = trpc.saas.classifyUnclassifiedCharge.useMutation({
    onSuccess: () => {
      toast.success("Cobrança classificada com sucesso!");
      utils.saas.listUnclassifiedCharges.invalidate();
      utils.saas.listCharges.invalidate();
      utils.saas.getFilteredStats.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const ignoreMutation = trpc.saas.ignoreUnclassifiedCharge.useMutation({
    onSuccess: () => {
      toast.success("Cobrança ignorada com sucesso!");
      utils.saas.listUnclassifiedCharges.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleClassify = (asaasChargeId: string) => {
    const clientId = selectedClient[asaasChargeId];
    const type = selectedType[asaasChargeId];

    if (!clientId || !type) {
      toast.error("Selecione cliente e tipo antes de classificar");
      return;
    }

    classifyMutation.mutate({
      unclassifiedChargeId: asaasChargeId,
      clientId,
      type,
    });
  };

  const handleIgnore = (asaasChargeId: string) => {
    ignoreMutation.mutate({ unclassifiedChargeId: asaasChargeId });
  };

  // Não mostrar se não houver cobranças não classificadas
  if (!unclassified || unclassified.length === 0) {
    return null;
  }

  return (
    <Card className="border-yellow-200 bg-yellow-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-yellow-600" />
          Cobranças Não Classificadas
        </CardTitle>
        <CardDescription>
          {unclassified.length} cobrança(s) do Asaas aguardando classificação manual
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {unclassified.map((charge) => (
            <div
              key={charge.asaasChargeId}
              className="p-4 bg-white border rounded-lg space-y-3"
            >
              {/* Informações da Cobrança */}
              <div>
                <h3 className="font-semibold">{charge.clientName || charge.asaasCustomerId}</h3>
                <p className="text-sm text-muted-foreground">{charge.clientEmail}</p>
                <div className="flex flex-wrap gap-4 mt-2 text-sm">
                  <span>
                    <strong>Descrição:</strong> {charge.description || "Sem descrição"}
                  </span>
                  <span>
                    <strong>Valor:</strong> {formatCurrency(typeof charge.value === 'string' ? parseFloat(charge.value) : charge.value)}
                  </span>
                  <span>
                    <strong>Vencimento:</strong> {new Date(charge.dueDate).toLocaleDateString('pt-BR')}
                  </span>
                  <span>
                    <strong>Status:</strong> {charge.status}
                  </span>
                </div>
              </div>

              {/* Dropdowns de Classificação */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label>Cliente</Label>
                  <Select
                    value={selectedClient[charge.asaasChargeId]?.toString() || ""}
                    onValueChange={(value) => setSelectedClient({ ...selectedClient, [charge.asaasChargeId]: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione cliente" />
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
                  <Label>Tipo</Label>
                  <Select
                    value={selectedType[charge.asaasChargeId] || ""}
                    onValueChange={(value: "monthly" | "quota_sale" | "fuel" | "repair" | "other") => setSelectedType({ ...selectedType, [charge.asaasChargeId]: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Mensalidade</SelectItem>
                      <SelectItem value="quota_sale">Venda de Cota</SelectItem>
                      <SelectItem value="fuel">Abastecimento</SelectItem>
                      <SelectItem value="repair">Reparos</SelectItem>
                      <SelectItem value="other">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    onClick={() => handleClassify(charge.asaasChargeId)}
                    disabled={classifyMutation.isPending}
                    className="flex-1"
                  >
                    Classificar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleIgnore(charge.asaasChargeId)}
                    disabled={ignoreMutation.isPending}
                  >
                    Ignorar
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Saas() {
  const [, setLocation] = useLocation();
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showEditChargeDialog, setShowEditChargeDialog] = useState(false);
  const [editingChargeId, setEditingChargeId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<"pending" | "paid" | "overdue" | "cancelled" | "all">("all");
  const [typeFilters, setTypeFilters] = useState<Array<"monthly" | "quota_sale" | "fuel" | "repair" | "other">>([]); // Filtro B: seleção múltipla
  // Mantém typeFilter para compatibilidade com código legado
  const typeFilter = typeFilters.length === 1 ? typeFilters[0] : "all";

  const toggleTypeFilter = (type: "monthly" | "quota_sale" | "fuel" | "repair" | "other") => {
    setTypeFilters(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };
  const [boatFilter, setBoatFilter] = useState<string>(""); // Filtro por embarcação
  const [searchQuery, setSearchQuery] = useState("");
  const [monthFilter, setMonthFilter] = useState<string>("");
  const [yearFilter, setYearFilter] = useState<string>("");
  
  const [editChargeForm, setEditChargeForm] = useState({
    value: "",
    dueDate: "",
    type: "monthly" as "monthly" | "quota_sale",
  });
  
  // Gerar mês atual no formato YYYY-MM
  const currentMonth = new Date().toISOString().slice(0, 7);

  const [form, setForm] = useState({
    clientId: 0,
    type: "monthly" as "monthly" | "quota_sale" | "fuel" | "repair" | "other",
    value: "",
    dueDay: "10",
    startMonth: currentMonth,
    endDate: "",
    yearlyAdjustment: "manual" as "manual" | "ipca" | "igpm",
    installments: 1,
  });

  const utils = trpc.useUtils();
  const { data: charges, isLoading } = trpc.saas.listCharges.useQuery({
    status: statusFilter === "all" ? "all" : statusFilter as "pending" | "paid" | "overdue" | "cancelled",
    types: typeFilters.length > 0 ? typeFilters : undefined,
    boatId: boatFilter ? parseInt(boatFilter) : undefined,
    month: monthFilter || undefined,
    year: yearFilter || undefined,
    search: searchQuery || undefined,
  });
  const { data: clients } = trpc.allowedClients.list.useQuery();
  const { data: boats } = trpc.vessels.list.useQuery(); // Buscar lista de embarcações
  const { data: dashboard } = trpc.saas.getFilteredStats.useQuery({
    status: statusFilter === "all" ? "all" : statusFilter as "pending" | "paid" | "overdue" | "cancelled",
    types: typeFilters.length > 0 ? typeFilters : undefined,
    boatId: boatFilter ? parseInt(boatFilter) : undefined,
    month: monthFilter || undefined,
    year: yearFilter || undefined,
    search: searchQuery || undefined,
  });

  const createMutation = trpc.saas.create.useMutation({
    onSuccess: () => {
      toast.success("Mensalidade criada com sucesso!");
      utils.saas.list.invalidate();
      utils.saas.getFilteredStats.invalidate();
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
      utils.saas.getFilteredStats.invalidate();
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
      utils.saas.getFilteredStats.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const markAsPaidMutation = trpc.saas.markChargeAsPaid.useMutation({
    onSuccess: () => {
      toast.success("Cobrança marcada como paga com sucesso!");
      utils.saas.list.invalidate();
      utils.saas.getFilteredStats.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateChargeMutation = trpc.saas.updateCharge.useMutation({
    onSuccess: async () => {
      toast.success("Cobrança atualizada com sucesso!");
      // Invalidar TODAS as queries relacionadas
      await utils.saas.list.invalidate();
      await utils.saas.listCharges.invalidate();
      await utils.saas.getFilteredStats.invalidate();
      // Forçar refetch imediato
      await utils.saas.listCharges.refetch();
      setShowEditChargeDialog(false);
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteChargeMutation = trpc.saas.deleteCharge.useMutation({
    onSuccess: () => {
      toast.success("Cobrança excluída com sucesso!");
      utils.saas.list.invalidate();
      utils.saas.getFilteredStats.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const syncMutation = trpc.saas.syncWithAsaas.useMutation({
    onSuccess: (data) => {
      const messages: string[] = [];
      messages.push(`✅ ${data.syncedCount} cobranças sincronizadas`);
      
      if (data.excludedCount && data.excludedCount > 0) {
        messages.push(`⛔ ${data.excludedCount} cobranças excluídas (abastecimento/vistorias)`);
      }
      
      if (data.unclassifiedCount && data.unclassifiedCount > 0) {
        messages.push(`⚠️ ${data.unclassifiedCount} cobranças não classificadas`);
        console.log('[Saas] Cobranças não classificadas:', data.unclassifiedCharges);
        toast.warning(messages.join('\n'), { duration: 10000 });
      } else {
        toast.success(messages.join('\n'), { duration: 5000 });
      }
      
      utils.saas.getFilteredStats.invalidate();
      utils.saas.list.invalidate();
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
      startMonth: new Date().toISOString().slice(0, 7),
      endDate: "",
      yearlyAdjustment: "manual",
      installments: 1,
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
      startMonth: form.startMonth,
      endDate: form.endDate || undefined,
      yearlyAdjustment: form.yearlyAdjustment,
      installments: form.type === "quota_sale" ? form.installments : undefined,
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (subscription: any) => {
    setEditingId(subscription.subscription.id);
    // Derivar startMonth do startDate existente (YYYY-MM-DD -> YYYY-MM)
    const startMonthVal = subscription.subscription.startDate
      ? subscription.subscription.startDate.split('T')[0].slice(0, 7)
      : new Date().toISOString().slice(0, 7);
    setForm({
      clientId: subscription.subscription.clientId,
      type: subscription.subscription.type,
      value: subscription.subscription.value,
      dueDay: subscription.subscription.dueDay.toString(),
      startMonth: startMonthVal,
      endDate: subscription.subscription.endDate ? subscription.subscription.endDate.split('T')[0] : "",
      yearlyAdjustment: subscription.subscription.yearlyAdjustment,
      installments: 1,
    });
    setShowDialog(true);
  };

  const handleCancel = (id: number) => {
    if (confirm("Tem certeza que deseja cancelar esta mensalidade?")) {
      cancelMutation.mutate({ id });
    }
  };

  const handleMarkAsPaid = (subscriptionId: number) => {
    if (!confirm("Tem certeza que deseja marcar esta mensalidade como paga?")) {
      return;
    }

    markAsPaidMutation.mutate({
      subscriptionId,
      paymentDate: new Date().toISOString().split('T')[0],
      notifyCustomer: false,
    });
  };

  const handleEditCharge = (chargeId: number) => {
    const charge = charges?.find(c => c.charge.id === chargeId);
    if (!charge) {
      toast.error("Cobrança não encontrada");
      return;
    }

    setEditingChargeId(chargeId);
    setEditChargeForm({
      value: charge.charge.value.toString(),
      dueDate: charge.charge.dueDate,
      type: (charge.charge.type ?? "monthly") as "monthly" | "quota_sale",
    });
    setShowEditChargeDialog(true);
  };

  const handleDeleteCharge = (chargeId: number) => {
    if (!confirm("Tem certeza que deseja excluir esta cobrança? Esta ação é permanente e não pode ser desfeita.")) {
      return;
    }

    deleteChargeMutation.mutate({ chargeId });
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
            <h1 className="text-2xl font-bold text-gray-900">BPO Financeiro</h1>
            <p className="text-sm text-gray-600">Gestão de pagamentos e recebimentos</p>
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
            Nova Cobrança
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
              {formatCurrency(dashboard?.totalExpected || 0)}
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
              {formatCurrency(dashboard?.totalPaid || 0)}
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
              {formatCurrency(dashboard?.totalPending || 0)}
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
              {formatCurrency(dashboard?.totalOverdue || 0)}
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
          {/* Filtro A: Status (seleção única) */}
          <div className="mb-3">
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Status</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={statusFilter === "all" ? "default" : "outline"}
                onClick={() => setStatusFilter("all")}
              >
                Todas
              </Button>
              <Button
                size="sm"
                variant={statusFilter === "pending" ? "default" : "outline"}
                onClick={() => setStatusFilter(statusFilter === "pending" ? "all" : "pending")}
              >
                Pendentes
              </Button>
              <Button
                size="sm"
                variant={statusFilter === "paid" ? "default" : "outline"}
                onClick={() => setStatusFilter(statusFilter === "paid" ? "all" : "paid")}
              >
                Pagas
              </Button>
              <Button
                size="sm"
                variant={statusFilter === "overdue" ? "default" : "outline"}
                onClick={() => setStatusFilter(statusFilter === "overdue" ? "all" : "overdue")}
              >
                Vencidas
              </Button>
            </div>
          </div>

          {/* Filtro B: Tipo (seleção múltipla) */}
          <div className="mb-4">
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
              Tipo {typeFilters.length > 0 && <span className="text-primary">({typeFilters.length} selecionado{typeFilters.length > 1 ? 's' : ''})</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              {([
                { value: "monthly", label: "Mensalidades" },
                { value: "quota_sale", label: "Vendas de Cotas" },
                { value: "fuel", label: "Abastecimento" },
                { value: "repair", label: "Reparos" },
                { value: "other", label: "Outros" },
              ] as const).map(({ value, label }) => (
                <Button
                  key={value}
                  size="sm"
                  variant={typeFilters.includes(value) ? "default" : "outline"}
                  onClick={() => toggleTypeFilter(value)}
                >
                  {label}
                </Button>
              ))}
              {typeFilters.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setTypeFilters([])}
                  className="text-muted-foreground"
                >
                  Limpar
                </Button>
              )}
            </div>
          </div>

          {/* Filtro de Busca, Período e Embarcação */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Busca por Cliente */}
            <div>
              <label className="text-sm font-medium mb-2 block">Buscar Cliente</label>
              <input
                type="text"
                placeholder="Nome ou email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>

            {/* Filtro por Embarcação */}
            <div>
              <label className="text-sm font-medium mb-2 block">Embarcação</label>
              <select
                value={boatFilter}
                onChange={(e) => setBoatFilter(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">Todas as embarcações</option>
                {boats?.map((boat) => (
                  <option key={boat.id} value={boat.id.toString()}>
                    {boat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro por Mês */}
            <div>
              <label className="text-sm font-medium mb-2 block">Mês</label>
              <select
                value={monthFilter}
                onChange={(e) => {
                  console.log('Month changed to:', e.target.value);
                  setMonthFilter(e.target.value);
                }}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">Todos os meses</option>
                <option value="01">Janeiro</option>
                <option value="02">Fevereiro</option>
                <option value="03">Março</option>
                <option value="04">Abril</option>
                <option value="05">Maio</option>
                <option value="06">Junho</option>
                <option value="07">Julho</option>
                <option value="08">Agosto</option>
                <option value="09">Setembro</option>
                <option value="10">Outubro</option>
                <option value="11">Novembro</option>
                <option value="12">Dezembro</option>
              </select>
            </div>

            {/* Filtro por Ano */}
            <div>
              <label className="text-sm font-medium mb-2 block">Ano</label>
              <select
                value={yearFilter}
                onChange={(e) => {
                  console.log('Year changed to:', e.target.value);
                  setYearFilter(e.target.value);
                }}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">Todos os anos</option>
                <option value="2024">2024</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
              </select>
            </div>
          </div>

          {/* Botão Limpar Filtros */}
          {(searchQuery || boatFilter || monthFilter || yearFilter || statusFilter !== "all" || typeFilter !== "all") && (
            <div className="mt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setSearchQuery("");
                  setBoatFilter("");
                  setMonthFilter("");
                  setYearFilter("");
                  setStatusFilter("all");
                  setTypeFilters([]);
                }}
              >
                Limpar Filtros
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cobranças Não Classificadas */}
      <UnclassifiedChargesSection />

      {/* Lista de Mensalidades */}
      <Card>
        <CardHeader>
          <CardTitle>Cobranças</CardTitle>
          <CardDescription>
            {charges?.length || 0} cobrança(s) encontrada(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground">Carregando...</p>
          ) : charges && charges.length > 0 ? (
            <div className="space-y-4">
              {charges.map((item) => (
                <div
                  key={item.charge.id}
                  className="flex flex-col md:flex-row md:items-center md:justify-between p-4 border rounded-lg gap-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{item.client?.name || "Cliente não encontrado"}</h3>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        item.charge.status === "paid" ? "bg-green-100 text-green-700" :
                        item.charge.status === "pending" ? "bg-yellow-100 text-yellow-700" :
                        item.charge.status === "overdue" ? "bg-red-100 text-red-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>
                        {item.charge.status === "paid" ? "Paga" :
                         item.charge.status === "pending" ? "Pendente" :
                         item.charge.status === "overdue" ? "Vencida" : "Cancelada"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">{item.client?.email}</p>
                    <div className="flex flex-wrap gap-4 mt-2 text-sm">
                      <span>
                        <strong>Tipo:</strong> {(item.charge.type || item.subscription?.type) === "monthly" ? "Mensalidade" : "Venda de Cota"}
                      </span>
                      <span>
                        <strong>Valor:</strong> {formatCurrency(parseFloat(item.charge.value))}
                      </span>
                      <span>
                        <strong>Vencimento:</strong> {new Date(item.charge.dueDate).toLocaleDateString('pt-BR')}
                      </span>
                      {item.charge.paidDate && (
                        <span>
                          <strong>Pago em:</strong> {new Date(item.charge.paidDate).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                      <span>
                        <strong>Reajuste:</strong> {
                          item.subscription?.yearlyAdjustment === "manual" ? "Manual" :
                          item.subscription?.yearlyAdjustment === "ipca" ? "IPCA" : "IGP-M"
                        }
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {item.charge.status !== "paid" && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleMarkAsPaid(item.subscription?.id || 0)}
                        disabled={item.charge.status === "cancelled"}
                        title="Marcar como recebido"
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                    )}
                    <a
                      href={`https://wa.me/${item.client?.phone?.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Falar no WhatsApp"
                    >
                      <Button variant="outline" size="icon">
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    </a>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleEditCharge(item.charge.id)}
                      title="Editar cobrança"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDeleteCharge(item.charge.id)}
                      title="Excluir cobrança"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
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
            <DialogTitle>{editingId ? "Editar Cobrança" : "Nova Cobrança"}</DialogTitle>
            <DialogDescription>
              Preencha os dados da Cobrança
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
                onValueChange={(value: "monthly" | "quota_sale" | "fuel" | "repair" | "other") => setForm({ ...form, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensalidade</SelectItem>
                  <SelectItem value="quota_sale">Venda de Cota</SelectItem>
                  <SelectItem value="fuel">Abastecimento</SelectItem>
                  <SelectItem value="repair">Reparos</SelectItem>
                  <SelectItem value="other">Outros</SelectItem>
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

            {/* Campo de Parcelas - Apenas para Venda de Cota */}
            {form.type === "quota_sale" && (
              <div>
                <Label>Número de Parcelas *</Label>
                <Select
                  value={form.installments.toString()}
                  onValueChange={(value) => setForm({ ...form, installments: parseInt(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1x (à vista)</SelectItem>
                    <SelectItem value="2">2x</SelectItem>
                    <SelectItem value="3">3x</SelectItem>
                    <SelectItem value="4">4x</SelectItem>
                    <SelectItem value="5">5x</SelectItem>
                    <SelectItem value="6">6x</SelectItem>
                    <SelectItem value="7">7x</SelectItem>
                    <SelectItem value="8">8x</SelectItem>
                    <SelectItem value="9">9x</SelectItem>
                    <SelectItem value="10">10x</SelectItem>
                    <SelectItem value="11">11x</SelectItem>
                    <SelectItem value="12">12x</SelectItem>
                    <SelectItem value="13">13x</SelectItem>
                    <SelectItem value="14">14x</SelectItem>
                    <SelectItem value="15">15x</SelectItem>
                    <SelectItem value="16">16x</SelectItem>
                    <SelectItem value="17">17x</SelectItem>
                    <SelectItem value="18">18x</SelectItem>
                    <SelectItem value="19">19x</SelectItem>
                    <SelectItem value="20">20x</SelectItem>
                    <SelectItem value="21">21x</SelectItem>
                    <SelectItem value="22">22x</SelectItem>
                    <SelectItem value="23">23x</SelectItem>
                    <SelectItem value="24">24x</SelectItem>
                    <SelectItem value="25">25x</SelectItem>
                    <SelectItem value="26">26x</SelectItem>
                    <SelectItem value="27">27x</SelectItem>
                    <SelectItem value="28">28x</SelectItem>
                    <SelectItem value="29">29x</SelectItem>
                    <SelectItem value="30">30x</SelectItem>
                    <SelectItem value="31">31x</SelectItem>
                    <SelectItem value="32">32x</SelectItem>
                    <SelectItem value="33">33x</SelectItem>
                    <SelectItem value="34">34x</SelectItem>
                    <SelectItem value="35">35x</SelectItem>
                    <SelectItem value="36">36x</SelectItem>
                  </SelectContent>
                </Select>
                {form.installments > 1 && form.value && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {form.installments}x de {formatCurrency(parseFloat(form.value) / form.installments)}
                  </p>
                )}
              </div>
            )}

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
              <Label>Mês de Início *</Label>
              <Input
                type="month"
                value={form.startMonth}
                onChange={(e) => setForm({ ...form, startMonth: e.target.value })}
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

      {/* Dialog de Editar Cobrança */}
      <Dialog open={showEditChargeDialog} onOpenChange={setShowEditChargeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Cobrança</DialogTitle>
            <DialogDescription>
              Edite os detalhes da cobrança abaixo
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo *</Label>
              <Select
                value={editChargeForm.type}
                onValueChange={(value: "monthly" | "quota_sale") => setEditChargeForm({ ...editChargeForm, type: value })}
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
                value={editChargeForm.value}
                onChange={(e) => setEditChargeForm({ ...editChargeForm, value: e.target.value })}
                placeholder="0.00"
              />
            </div>

            <div>
              <Label>Data de Vencimento *</Label>
              <Input
                type="date"
                value={editChargeForm.dueDate}
                onChange={(e) => setEditChargeForm({ ...editChargeForm, dueDate: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditChargeDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                if (!editingChargeId) return;
                updateChargeMutation.mutate({
                  chargeId: editingChargeId,
                  value: parseFloat(editChargeForm.value),
                  dueDate: editChargeForm.dueDate,
                  type: editChargeForm.type,
                });
              }}
              disabled={updateChargeMutation.isPending}
            >
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
