import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  DollarSign, TrendingUp, Clock, AlertTriangle,
  RefreshCw, Download, Search, ChevronLeft, ChevronRight,
  CheckCircle2, Loader2, RotateCcw, BarChart3, Webhook,
  GitCompare, Receipt, TrendingDown, Activity, AlertCircle,
  Pencil, Trash2, Plus, CreditCard, Scissors, HandCoins, Wand2
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  received:       { label: "Recebido",    color: "bg-green-100 text-green-800" },
  confirmed:      { label: "Confirmado",  color: "bg-green-100 text-green-800" },
  receivedInCash: { label: "Pago (Cash)", color: "bg-emerald-100 text-emerald-800" },
  pending:        { label: "Pendente",    color: "bg-yellow-100 text-yellow-800" },
  overdue:        { label: "Vencido",     color: "bg-red-100 text-red-800" },
  refunded:       { label: "Estornado",   color: "bg-gray-100 text-gray-700" },
  cancelled:      { label: "Cancelado",   color: "bg-gray-100 text-gray-500" },
};

const TYPE_LABELS: Record<string, string> = {
  monthly:    "Mensalidade",
  quota_sale: "Venda de Cota",
  fuel:       "Abastecimento",
  repair:     "Reparo",
  inspection: "Vistoria",
  other:      "Outros",
};

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

/** Converte YYYY-MM-DD para DD/MM/AAAA. Retorna o valor original se não for possível converter. */
function fmtDate(date: string | null | undefined): string {
  if (!date) return "";
  // Formato ISO: YYYY-MM-DD
  const match = String(date).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return String(date);
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? { label: status, color: "bg-gray-100 text-gray-700" };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>
      {s.label}
    </span>
  );
}

const YEARS = ["Todos os anos", "2024", "2025", "2026", "2027", "2028", "2029", "2030"];
const MONTHS = [
  { value: "all", label: "Todos os meses" },
  { value: "1", label: "Janeiro" }, { value: "2", label: "Fevereiro" },
  { value: "3", label: "Março" }, { value: "4", label: "Abril" },
  { value: "5", label: "Maio" }, { value: "6", label: "Junho" },
  { value: "7", label: "Julho" }, { value: "8", label: "Agosto" },
  { value: "9", label: "Setembro" }, { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" }, { value: "12", label: "Dezembro" },
];

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function Saas() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("Todos os anos");
  const [monthFilter, setMonthFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [vesselFilter, setVesselFilter] = useState("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const queryFilters = useMemo(() => ({
    status: statusFilter !== "all" ? statusFilter : undefined,
    type: typeFilter !== "all" ? typeFilter : undefined,
    year: yearFilter !== "Todos os anos" ? yearFilter : undefined,
    month: monthFilter !== "all" ? monthFilter : undefined,
    search: search || undefined,
    vesselName: vesselFilter !== "all" ? vesselFilter : undefined,
  }), [statusFilter, typeFilter, yearFilter, monthFilter, search, vesselFilter]);

  const statsQuery = trpc.bpo.getStats.useQuery(queryFilters, { refetchOnWindowFocus: false });
  const chargesQuery = trpc.bpo.listCharges.useQuery(
    { ...queryFilters, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
    { refetchOnWindowFocus: false }
  );
  const unclassifiedQuery = trpc.bpo.listUnclassified.useQuery(
    { limit: 50, offset: 0 },
    { refetchOnWindowFocus: false }
  );

  // ── DRE ──
  const [dreYear, setDreYear] = useState(String(new Date().getFullYear()));
  const [dreMonth, setDreMonth] = useState("all");
  const [dreVesselId, setDreVesselId] = useState<number | undefined>(undefined);
  const dreQuery = trpc.bpo.getDRE.useQuery(
    { year: dreYear, month: dreMonth !== "all" ? dreMonth : undefined },
    { refetchOnWindowFocus: false, enabled: dreVesselId === undefined }
  );
  const dreByVesselQuery = trpc.bpo.getDREByVessel.useQuery(
    { year: dreYear !== "all" ? dreYear : undefined, month: dreMonth !== "all" ? dreMonth : undefined, vesselId: dreVesselId },
    { refetchOnWindowFocus: false }
  );

  // ── Webhooks ──
  const [webhookPage, setWebhookPage] = useState(0);
  const WEBHOOK_PAGE_SIZE = 50;
  const webhookQuery = trpc.bpo.listWebhookLogs.useQuery(
    { limit: WEBHOOK_PAGE_SIZE, offset: webhookPage * WEBHOOK_PAGE_SIZE },
    { refetchOnWindowFocus: false }
  );

  // ── Reconciliação ──
  const reconciliationQuery = trpc.bpo.getReconciliationReport.useQuery(
    undefined,
    { refetchOnWindowFocus: false }
  );

  const utils = trpc.useUtils();

  // ── Dialog: Nova Cobrança ──
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({
    clientId: "",
    type: "monthly" as "monthly" | "quota_sale" | "fuel" | "repair" | "other",
    value: "",
    dueDay: "10",
    startMonth: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
    installments: "1",
    description: "",
    yearlyAdjustment: "none" as "none" | "ipca" | "igpm" | "manual",
  });

  // ── Dialog: Editar Cobrança ──
  const [editCharge, setEditCharge] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    type: "monthly" as "monthly" | "quota_sale" | "fuel" | "repair" | "other",
    value: "",
    dueDate: "",
    description: "",
    clientId: undefined as number | undefined,
  });
  const [editClientSearch, setEditClientSearch] = useState("");

  // ── Dialog: Dar Baixa ──
  const [markPaidCharge, setMarkPaidCharge] = useState<any>(null);
  const [markPaidForm, setMarkPaidForm] = useState({
    paymentDate: new Date().toISOString().split('T')[0],
    value: "",
  });

  // ── Dialog: Pagamento Parcial ──
  const [partialCharge, setPartialCharge] = useState<any>(null);
  const [partialForm, setPartialForm] = useState({
    value: "",
    paymentDate: new Date().toISOString().split('T')[0],
  });

  // ── Dialog: Gerar PIX Individual ──
  const [pixLinkCharge, setPixLinkCharge] = useState<any>(null);
  const [pixLinkResult, setPixLinkResult] = useState<any>(null);

  // ── Dialog: Split de PIX ──
  const [showSplitDialog, setShowSplitDialog] = useState(false);
  const [splitSourceCharge, setSplitSourceCharge] = useState<any>(null); // cobrança não classificada de origem
  const [splitForm, setSplitForm] = useState({
    pixValue: "",
    paymentDate: new Date().toISOString().split('T')[0],
    splits: [] as Array<{ chargeId: number; clientName: string; description: string; value: number; chargeValue: number; dueDate: string; amount: string }>,
  });
  const [splitClientId, setSplitClientId] = useState("");
  const pendingChargesQuery = trpc.bpo.getClientPendingCharges.useQuery(
    { clientId: parseInt(splitClientId) },
    { enabled: showSplitDialog && !!splitClientId && !isNaN(parseInt(splitClientId)), refetchOnWindowFocus: false }
  );

  // ── Lista de clientes para o formulário e para o Split de PIX ──
  const clientsQuery = trpc.allowedClients.list.useQuery(
    undefined,
    { refetchOnWindowFocus: false, enabled: showCreateDialog || showSplitDialog }
  );

  const createChargeMutation = trpc.bpo.createCharge.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setShowCreateDialog(false);
      setCreateForm({ clientId: "", type: "monthly", value: "", dueDay: "10", startMonth: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`, installments: "1", description: "", yearlyAdjustment: "none" as "none" | "ipca" | "igpm" | "manual" });
      utils.bpo.getStats.invalidate();
      utils.bpo.listCharges.invalidate();
    },
    onError: (err) => toast.error(`Erro ao criar cobrança: ${err.message}`),
  });

  const updateChargeMutation = trpc.bpo.updateCharge.useMutation({
    onSuccess: () => {
      toast.success("Cobrança atualizada com sucesso");
      setEditCharge(null);
      utils.bpo.listCharges.invalidate();
    },
    onError: (err) => toast.error(`Erro ao atualizar: ${err.message}`),
  });

  const deleteChargeMutation = trpc.bpo.deleteCharge.useMutation({
    onSuccess: () => {
      toast.success("Cobrança excluída com sucesso");
      utils.bpo.getStats.invalidate();
      utils.bpo.listCharges.invalidate();
    },
    onError: (err) => toast.error(`Erro ao excluir: ${err.message}`),
  });

  const markAsPaidMutation = trpc.bpo.markAsPaid.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setMarkPaidCharge(null);
      utils.bpo.getStats.invalidate();
      utils.bpo.listCharges.invalidate();
    },
    onError: (err) => toast.error(`Erro ao dar baixa: ${err.message}`),
  });

  const registerPartialMutation = trpc.bpo.registerPartialPayment.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setPartialCharge(null);
      utils.bpo.getStats.invalidate();
      utils.bpo.listCharges.invalidate();
    },
    onError: (err) => toast.error(`Erro no pagamento parcial: ${err.message}`),
  });

  const splitPaymentMutation = trpc.bpo.splitPayment.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setShowSplitDialog(false);
      setSplitForm({ pixValue: "", paymentDate: new Date().toISOString().split('T')[0], splits: [] });
      setSplitClientId("");
      setSplitSourceCharge(null);
      utils.bpo.getStats.invalidate();
      utils.bpo.listCharges.invalidate();
      utils.bpo.listUnclassified.invalidate();
    },
    onError: (err) => toast.error(`Erro no split: ${err.message}`),
  });

  function handleEditClick(charge: any) {
    setEditCharge(charge);
    setEditForm({
      type: (charge.type as any) ?? "other",
      value: String(parseFloat(charge.value ?? "0")),
      dueDate: charge.due_date ?? "",
      description: charge.description ?? "",
      clientId: undefined,
    });
    setEditClientSearch("");
  }

  function handleDeleteClick(charge: any) {
    if (window.confirm(`Excluir cobrança de ${fmt(parseFloat(charge.value ?? "0"))} de ${charge.client_name ?? "cliente"}? Esta ação também cancelará a cobrança no Asaas.`)) {
      deleteChargeMutation.mutate({ chargeId: charge.id, cancelInAsaas: true });
    }
  }

  const importMutation = trpc.bpo.importFromAsaas.useMutation({
    onSuccess: (data) => {
      toast.success(`Importação concluída: ${data.inserted} inseridas, ${data.updated} atualizadas`);
      utils.bpo.getStats.invalidate();
      utils.bpo.listCharges.invalidate();
      utils.bpo.listUnclassified.invalidate();
    },
    onError: (err) => toast.error(`Erro na importação: ${err.message}`),
  });

  const syncMutation = trpc.bpo.syncIncremental.useMutation({
    onSuccess: (data) => {
      toast.success(`Sincronização concluída: ${data.updated} atualizadas`);
      utils.bpo.getStats.invalidate();
      utils.bpo.listCharges.invalidate();
    },
    onError: (err) => toast.error(`Erro na sincronização: ${err.message}`),
  });

  const classifyMutation = trpc.bpo.manualClassify.useMutation({
    onSuccess: () => {
      toast.success("Cobrança classificada");
      utils.bpo.listUnclassified.invalidate();
      utils.bpo.getStats.invalidate();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const autoClassifyMutation = trpc.bpo.autoClassifyAll.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      utils.bpo.listUnclassified.invalidate();
      utils.bpo.getStats.invalidate();
      utils.bpo.listCharges.invalidate();
    },
    onError: (err) => toast.error(`Erro na classificação automática: ${err.message}`),
  });

  const generatePixLinkMutation = trpc.bpo.generatePixLink.useMutation({
    onSuccess: (data) => {
      setPixLinkResult(data);
      utils.bpo.listCharges.invalidate();
    },
    onError: (err) => toast.error(`Erro ao gerar PIX: ${err.message}`),
  });

  const linkClientMutation = trpc.bpo.linkClient.useMutation({
    onSuccess: (data) => {
      toast.success(`Cliente vinculado: ${data.clientName}`);
      utils.bpo.listUnclassified.invalidate();
    },
    onError: (err) => toast.error(`Erro ao vincular cliente: ${err.message}`),
  });

  const activeClientsQuery = trpc.bpo.listActiveClients.useQuery(undefined, { refetchOnWindowFocus: false });
  const vesselsForFilterQuery = trpc.bpo.listVesselsForFilter.useQuery(undefined, { refetchOnWindowFocus: false });

  const stats = statsQuery.data;
  const charges = chargesQuery.data?.items ?? [];
  const totalCharges = chargesQuery.data?.total ?? 0;
  const totalPages = Math.ceil(totalCharges / PAGE_SIZE);

  const [, navigate] = useLocation();

  function clearFilters() {
    setStatusFilter("all");
    setTypeFilter("all");
    setYearFilter("Todos os anos");
    setMonthFilter("all");
    setSearch("");
    setVesselFilter("all");
    setPage(0);
  }

  const hasFilters =
    statusFilter !== "all" ||
    typeFilter !== "all" ||
    yearFilter !== "Todos os anos" ||
    monthFilter !== "all" ||
    search !== "" ||
    vesselFilter !== "all";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.history.back()}
            className="shrink-0"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold">BPO Financeiro</h1>
            <p className="text-sm text-muted-foreground">Gestão de pagamentos e recebimentos</p>
          </div>
        </div>

      </div>

      {/* Tabs */}
      <Tabs defaultValue="charges">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="charges">Cobranças</TabsTrigger>
          <TabsTrigger value="expenses"><Receipt className="h-3.5 w-3.5 mr-1" />Despesas</TabsTrigger>
          <TabsTrigger value="dre"><BarChart3 className="h-3.5 w-3.5 mr-1" />DRE Consolidado</TabsTrigger>
          <TabsTrigger value="webhooks"><Webhook className="h-3.5 w-3.5 mr-1" />Webhooks</TabsTrigger>
          <TabsTrigger value="reconciliation"><GitCompare className="h-3.5 w-3.5 mr-1" />Reconciliação</TabsTrigger>
          <TabsTrigger value="classify">
            Classificar
            {(unclassifiedQuery.data?.total ?? 0) > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs">
                {unclassifiedQuery.data?.total}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Cobranças ── */}
        <TabsContent value="charges" className="space-y-4">
          {/* Botões de ação — apenas na aba Cobranças */}
          <div className="flex gap-2 flex-wrap justify-end">
            <Button
              size="sm"
              onClick={() => setShowCreateDialog(true)}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nova Cobrança
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending}
            >
              {importMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                : <Download className="h-4 w-4 mr-2" />}
              Importar Histórico
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              {syncMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                : <RefreshCw className="h-4 w-4 mr-2" />}
              Sincronizar com Asaas
            </Button>
          </div>
          {/* Cards de totais — apenas na aba Cobranças */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Total Esperado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {statsQuery.isLoading ? "..." : fmt(stats?.totalExpected ?? 0)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-green-500" /> Recebido
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-green-600">
                  {statsQuery.isLoading ? "..." : fmt(stats?.totalPaid ?? 0)}
                </p>
                <p className="text-xs text-muted-foreground">{stats?.paidCount ?? 0} cobrança(s)</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4 text-yellow-500" /> Pendente
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-yellow-600">
                  {statsQuery.isLoading ? "..." : fmt(stats?.totalPending ?? 0)}
                </p>
                <p className="text-xs text-muted-foreground">{stats?.pendingCount ?? 0} cobrança(s)</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" /> Vencido
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-red-600">
                  {statsQuery.isLoading ? "..." : fmt(stats?.totalOverdue ?? 0)}
                </p>
                <p className="text-xs text-muted-foreground">{stats?.overdueCount ?? 0} cobrança(s)</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-4 space-y-4">
              {/* Filtros de status */}
              <div className="flex flex-wrap gap-2">
                {[
                  { v: "all", l: "Todas" },
                  { v: "pending", l: "Pendentes" },
                  { v: "paid", l: "Pagas" },
                  { v: "overdue", l: "Vencidas" },
                  { v: "receivedInCash", l: "Parciais" },
                ].map(({ v, l }) => (
                  <Button
                    key={v}
                    variant={statusFilter === v ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setStatusFilter(v); setPage(0); }}
                  >
                    {l}
                  </Button>
                ))}
              </div>

              {/* Filtros de tipo */}
              <div className="flex flex-wrap gap-2">
                {[
                  { v: "all", l: "Todos os tipos" },
                  { v: "monthly", l: "Mensalidades" },
                  { v: "quota_sale", l: "Vendas de Cotas" },
                  { v: "fuel", l: "Abastecimento" },
                  { v: "repair", l: "Reparos" },
                  { v: "other", l: "Outros" },
                ].map(({ v, l }) => (
                  <Button
                    key={v}
                    variant={typeFilter === v ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => { setTypeFilter(v); setPage(0); }}
                  >
                    {l}
                  </Button>
                ))}
              </div>

              {/* Busca + Embarcação + Mês + Ano */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Nome ou email..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                    className="pl-9"
                  />
                </div>
                <Select
                  value={vesselFilter}
                  onValueChange={(v) => { setVesselFilter(v); setPage(0); }}
                >
                  <SelectTrigger><SelectValue placeholder="Todas as embarcações" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as embarcações</SelectItem>
                    {(vesselsForFilterQuery.data ?? []).map((v: any) => (
                      <SelectItem key={v.id} value={v.name}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={monthFilter}
                  onValueChange={(v) => { setMonthFilter(v); setPage(0); }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={yearFilter}
                  onValueChange={(v) => { setYearFilter(v); setPage(0); }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {YEARS.map((y) => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <RotateCcw className="h-4 w-4 mr-2" /> Limpar Filtros
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Lista */}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {chargesQuery.isLoading
                ? "Carregando..."
                : `${totalCharges} cobrança(s) encontrada(s)`}
            </p>

            {chargesQuery.isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : charges.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Nenhuma cobrança encontrada</p>
                <p className="text-sm">Importe o histórico do Asaas para começar</p>
              </div>
            ) : (
              charges.map((charge: any) => (
                <Card key={charge.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="py-3 px-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">
                            {charge.client_name || charge.client_email || "Cliente não vinculado"}
                          </span>
                          <StatusBadge status={charge.status} />
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                            {TYPE_LABELS[charge.type] ?? charge.type}
                          </span>
                        </div>
                        {charge.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {charge.description}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
Venc: {fmtDate(charge.due_date)}
                           {charge.paid_date && ` · Pago: ${fmtDate(charge.paid_date)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        <div className="text-right">
                          <p className="font-semibold">{fmt(parseFloat(charge.value ?? "0"))}</p>
                          {charge.amount_paid &&
                            parseFloat(charge.amount_paid) > 0 &&
                            parseFloat(charge.amount_paid) !== parseFloat(charge.value) && (
                              <p className="text-xs text-muted-foreground">
                                Pago: {fmt(parseFloat(charge.amount_paid))}
                              </p>
                            )}
                        </div>
                        {(charge.status === "pending" || charge.status === "overdue") && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-green-700 hover:text-green-800 hover:bg-green-50 px-2"
                              onClick={() => {
                                setMarkPaidCharge(charge);
                                setMarkPaidForm({
                                  paymentDate: new Date().toISOString().split('T')[0],
                                  value: String(charge.value ?? ""),
                                });
                              }}
                              title="Dar baixa (recebido)"
                            >
                              <HandCoins className="h-3.5 w-3.5 mr-1" />Dar Baixa
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-orange-700 hover:text-orange-800 hover:bg-orange-50 px-2"
                              onClick={() => {
                                setPartialCharge(charge);
                                setPartialForm({
                                  value: "",
                                  paymentDate: new Date().toISOString().split('T')[0],
                                });
                              }}
                              title="Registrar pagamento parcial"
                            >
                              <CreditCard className="h-3.5 w-3.5 mr-1" />Parcial
                            </Button>
                          </>
                        )}
                        {/* Botão Gerar PIX Individual */}
                        {['pending','overdue','partiallyPaid'].includes(charge.status) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-violet-700 hover:text-violet-800 hover:bg-violet-50 px-2"
                            onClick={() => {
                              setPixLinkCharge(charge);
                              setPixLinkResult(null);
                              generatePixLinkMutation.mutate({ chargeId: charge.id });
                            }}
                            disabled={generatePixLinkMutation.isPending && pixLinkCharge?.id === charge.id}
                            title="Gerar link PIX individual"
                          >
                            {generatePixLinkMutation.isPending && pixLinkCharge?.id === charge.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                              : <span className="mr-1">PIX</span>
                            }
                            {charge.payment_link ? 'Ver PIX' : 'Gerar PIX'}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-blue-600"
                          onClick={() => handleEditClick(charge)}
                          disabled={updateChargeMutation.isPending}
                          title="Editar cobrança"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-red-600"
                          onClick={() => handleDeleteClick(charge)}
                          disabled={deleteChargeMutation.isPending}
                          title="Excluir cobrança"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  Página {page + 1} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Tab: Despesas ── */}
        <TabsContent value="expenses" className="space-y-4">
          <ExpensesTab />
        </TabsContent>

        {/* ── Tab: DRE Consolidado ── */}
        <TabsContent value="dre" className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={dreYear} onValueChange={setDreYear}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.filter(y => y !== "Todos os anos").map(y => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={dreMonth} onValueChange={setDreMonth}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select
              value={dreVesselId !== undefined ? String(dreVesselId) : "all"}
              onValueChange={(v) => setDreVesselId(v === "all" ? undefined : parseInt(v))}
            >
              <SelectTrigger className="w-52"><SelectValue placeholder="Todas as embarcações" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as embarcações</SelectItem>
                {(vesselsForFilterQuery.data ?? []).map((v: any) => (
                  <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => { dreQuery.refetch(); dreByVesselQuery.refetch(); }}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />Atualizar
            </Button>
          </div>
          {(dreVesselId !== undefined ? dreByVesselQuery.isLoading : dreQuery.isLoading) ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : dreVesselId !== undefined ? (
            <DREByVesselView data={dreByVesselQuery.data} vesselName={(vesselsForFilterQuery.data ?? []).find((v: any) => v.id === dreVesselId)?.name} />
          ) : (
            <DREView data={dreQuery.data} />
          )}
        </TabsContent>

        {/* ── Tab: Webhooks ── */}
        <TabsContent value="webhooks" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Log de Webhooks Asaas</h3>
              <p className="text-sm text-muted-foreground">Eventos recebidos em tempo real do Asaas</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => webhookQuery.refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />Atualizar
            </Button>
          </div>
          {webhookQuery.isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : (webhookQuery.data?.logs ?? []).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhum webhook recebido ainda</p>
              <p className="text-sm">Os eventos do Asaas aparecerão aqui automaticamente</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(webhookQuery.data?.logs ?? []).map((log: any) => (
                <Card key={log.id} className={log.processed ? "" : "border-red-200 bg-red-50/30"}>
                  <CardContent className="py-3 px-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium ${
                            log.processed ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                          }`}>{log.event}</span>
                          {log.processed ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">{log.asaas_payment_id}</p>
                        {log.error && <p className="text-xs text-red-600">{log.error}</p>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(log.created_at).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {/* Paginação webhooks */}
              {(webhookQuery.data?.total ?? 0) > WEBHOOK_PAGE_SIZE && (
                <div className="flex items-center justify-between pt-2">
                  <Button variant="outline" size="sm" onClick={() => setWebhookPage(p => Math.max(0, p - 1))} disabled={webhookPage === 0}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">Página {webhookPage + 1}</span>
                  <Button variant="outline" size="sm" onClick={() => setWebhookPage(p => p + 1)} disabled={(webhookPage + 1) * WEBHOOK_PAGE_SIZE >= (webhookQuery.data?.total ?? 0)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* ── Tab: Reconciliação ── */}
        <TabsContent value="reconciliation" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Reconciliação de Cobranças</h3>
              <p className="text-sm text-muted-foreground">Cobranças pendentes e divergências nos últimos 90 dias</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => reconciliationQuery.refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />Atualizar
            </Button>
          </div>
          {reconciliationQuery.isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : (
            <ReconciliationView data={reconciliationQuery.data} />
          )}
        </TabsContent>

        {/* ── Tab: Classificar ── */}
        <TabsContent value="classify" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Cobranças Não Classificadas</h3>
              <p className="text-sm text-muted-foreground">
                {unclassifiedQuery.data?.total ?? 0} cobrança(s) aguardando classificação
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="text-green-700 border-green-300 hover:bg-green-50"
                onClick={() => autoClassifyMutation.mutate()}
                disabled={autoClassifyMutation.isPending}
              >
                {autoClassifyMutation.isPending ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Classificando...</>
                ) : (
                  <><Wand2 className="h-3.5 w-3.5 mr-1" />Classificar Auto</>
                )}
              </Button>

            </div>
          </div>

          {unclassifiedQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (unclassifiedQuery.data?.charges ?? []).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-500 opacity-60" />
              <p className="font-medium">Todas as cobranças estão classificadas!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(unclassifiedQuery.data?.charges ?? []).map((charge: any) => (
                <UnclassifiedChargeCard
                   key={charge.id}
                   charge={charge}
                   onClassify={(type) =>
                     classifyMutation.mutate({ chargeId: charge.id, type: type as "monthly" | "quota_sale" | "fuel" | "repair" | "other" })
                   }
                   loading={classifyMutation.isPending}
                   onLinkClient={(clientId) =>
                     linkClientMutation.mutate({ chargeId: charge.id, clientId })
                   }
                   linkLoading={linkClientMutation.isPending}
                   activeClients={activeClientsQuery.data ?? []}
                   onSplit={() => {
                     setSplitSourceCharge(charge);
                     setSplitForm({
                       pixValue: String(parseFloat(charge.value ?? '0')),
                       paymentDate: charge.due_date ?? new Date().toISOString().split('T')[0],
                       splits: [],
                     });
                     // Pré-selecionar o cliente se já estiver vinculado
                     const clientId = charge.client_id ?? charge.clientId;
                     if (clientId) setSplitClientId(String(clientId));
                     else setSplitClientId("");
                     setShowSplitDialog(true);
                   }}
                 />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Dialog: Nova Cobrança ─── */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Cobrança</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Cliente *</Label>
              <Select
                value={createForm.clientId}
                onValueChange={(v) => setCreateForm(f => ({ ...f, clientId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cliente..." />
                </SelectTrigger>
                <SelectContent>
                  {(clientsQuery.data ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Tipo *</Label>
              <Select
                value={createForm.type}
                onValueChange={(v) => setCreateForm(f => ({ ...f, type: v as any }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensalidade</SelectItem>
                  <SelectItem value="quota_sale">Venda de Cota</SelectItem>
                  <SelectItem value="fuel">Abastecimento</SelectItem>
                  <SelectItem value="repair">Reparo</SelectItem>
                  <SelectItem value="other">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Valor (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0,00"
                  value={createForm.value}
                  onChange={(e) => setCreateForm(f => ({ ...f, value: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Dia do Vencimento *</Label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  placeholder="10"
                  value={createForm.dueDay}
                  onChange={(e) => setCreateForm(f => ({ ...f, dueDay: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Mês de Início *</Label>
                <Input
                  type="month"
                  value={createForm.startMonth}
                  onChange={(e) => setCreateForm(f => ({ ...f, startMonth: e.target.value }))}
                />
              </div>
              {createForm.type === "quota_sale" && (
                <div className="space-y-1">
                  <Label>Nº de Parcelas</Label>
                  <Input
                    type="number"
                    min="1"
                    max="36"
                    value={createForm.installments}
                    onChange={(e) => setCreateForm(f => ({ ...f, installments: e.target.value }))}
                  />
                </div>
              )}
            </div>

            {createForm.type === "monthly" && (
              <div className="space-y-1">
                <Label>Reajuste Anual</Label>
                <Select
                  value={createForm.yearlyAdjustment}
                  onValueChange={(v) => setCreateForm(f => ({ ...f, yearlyAdjustment: v as any }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Manual (sem reajuste automático)</SelectItem>
                    <SelectItem value="ipca">IPCA (~4,5% a.a.)</SelectItem>
                    <SelectItem value="igpm">IGP-M (~5% a.a.)</SelectItem>
                    <SelectItem value="manual">Manual (definir manualmente)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Índice de reajuste aplicado nas cobranças de anos futuros</p>
              </div>
            )}

            <div className="space-y-1">
              <Label>Descrição (opcional)</Label>
              <Input
                placeholder="Ex: Mensalidade Cota Jet Ski..."
                value={createForm.description}
                onChange={(e) => setCreateForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            {createForm.type === "quota_sale" && parseInt(createForm.installments) > 1 && (
              <p className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded p-2">
                Serão criadas <strong>{createForm.installments} cobranças</strong> de{" "}
                <strong>{fmt(parseFloat(createForm.value || "0") / parseInt(createForm.installments || "1"))}</strong> cada,
                a partir de {createForm.startMonth}.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!createForm.clientId) return toast.error("Selecione um cliente");
                if (!createForm.value || parseFloat(createForm.value) <= 0) return toast.error("Informe um valor válido");
                createChargeMutation.mutate({
                  clientId: parseInt(createForm.clientId),
                  type: createForm.type,
                  value: parseFloat(createForm.value),
                  dueDay: parseInt(createForm.dueDay),
                  startMonth: createForm.startMonth,
                  installments: parseInt(createForm.installments),
                  description: createForm.description || undefined,
                  yearlyAdjustment: createForm.type === "monthly" && createForm.yearlyAdjustment !== "none" ? createForm.yearlyAdjustment as any : undefined,
                });
              }}
              disabled={createChargeMutation.isPending}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {createChargeMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Criando...</>
              ) : (
                <><Plus className="h-4 w-4 mr-2" />Criar Cobrança</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Dar Baixa ─── */}
      <Dialog open={!!markPaidCharge} onOpenChange={(open) => { if (!open) setMarkPaidCharge(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HandCoins className="h-5 w-5 text-green-600" />Dar Baixa
            </DialogTitle>
          </DialogHeader>
          {markPaidCharge && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Cliente: <strong>{markPaidCharge.client_name ?? markPaidCharge.client_email ?? "Desconhecido"}</strong>
              </p>
              <p className="text-sm text-muted-foreground">
                Valor original: <strong>{fmt(parseFloat(markPaidCharge.value ?? "0"))}</strong>
              </p>
              <div className="space-y-1">
                <Label>Valor Recebido (R$)</Label>
                <Input
                  type="number" step="0.01" min="0.01"
                  value={markPaidForm.value}
                  onChange={(e) => setMarkPaidForm(f => ({ ...f, value: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Data do Pagamento</Label>
                <Input
                  type="date"
                  value={markPaidForm.paymentDate}
                  onChange={(e) => setMarkPaidForm(f => ({ ...f, paymentDate: e.target.value }))}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkPaidCharge(null)}>Cancelar</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={() => {
                if (!markPaidCharge) return;
                if (!markPaidForm.value || parseFloat(markPaidForm.value) <= 0) return toast.error("Informe o valor recebido");
                markAsPaidMutation.mutate({
                  chargeId: markPaidCharge.id,
                  paymentDate: markPaidForm.paymentDate,
                  value: parseFloat(markPaidForm.value),
                });
              }}
              disabled={markAsPaidMutation.isPending}
            >
              {markAsPaidMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Confirmar Baixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Pagamento Parcial ─── */}
      <Dialog open={!!partialCharge} onOpenChange={(open) => { if (!open) setPartialCharge(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-orange-600" />Pagamento Parcial
            </DialogTitle>
          </DialogHeader>
          {partialCharge && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Cliente: <strong>{partialCharge.client_name ?? partialCharge.client_email ?? "Desconhecido"}</strong>
              </p>
              <div className="flex gap-4 text-sm">
                <span>Total: <strong>{fmt(parseFloat(partialCharge.value ?? "0"))}</strong></span>
                {partialCharge.amount_paid && parseFloat(partialCharge.amount_paid) > 0 && (
                  <span className="text-green-700">Já pago: <strong>{fmt(parseFloat(partialCharge.amount_paid))}</strong></span>
                )}
              </div>
              <div className="space-y-1">
                <Label>Valor Recebido Agora (R$)</Label>
                <Input
                  type="number" step="0.01" min="0.01"
                  placeholder="0,00"
                  value={partialForm.value}
                  onChange={(e) => setPartialForm(f => ({ ...f, value: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Data do Pagamento</Label>
                <Input
                  type="date"
                  value={partialForm.paymentDate}
                  onChange={(e) => setPartialForm(f => ({ ...f, paymentDate: e.target.value }))}
                />
              </div>
              {partialForm.value && parseFloat(partialForm.value) > 0 && (
                <p className="text-xs text-muted-foreground bg-orange-50 border border-orange-200 rounded p-2">
                  Saldo restante após este pagamento:{" "}
                  <strong className="text-orange-700">
                    {fmt(Math.max(0, parseFloat(partialCharge.value ?? "0") - (parseFloat(partialCharge.amount_paid ?? "0") + parseFloat(partialForm.value))))}
                  </strong>
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPartialCharge(null)}>Cancelar</Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={() => {
                if (!partialCharge) return;
                if (!partialForm.value || parseFloat(partialForm.value) <= 0) return toast.error("Informe o valor recebido");
                registerPartialMutation.mutate({
                  chargeId: partialCharge.id,
                  value: parseFloat(partialForm.value),
                  paymentDate: partialForm.paymentDate,
                });
              }}
              disabled={registerPartialMutation.isPending}
            >
              {registerPartialMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
              Registrar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Split de PIX ─── */}
      <Dialog open={showSplitDialog} onOpenChange={(open) => { if (!open) { setShowSplitDialog(false); setSplitClientId(""); setSplitForm({ pixValue: "", paymentDate: new Date().toISOString().split('T')[0], splits: [] }); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scissors className="h-5 w-5 text-purple-600" />Split de PIX
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {splitSourceCharge && (
              <div className="rounded-lg border border-purple-200 bg-purple-50/40 p-3 text-sm">
                <p className="font-medium text-purple-900">
                  PIX de origem: {splitSourceCharge.clientName || splitSourceCharge.client_name || splitSourceCharge.clientEmail || splitSourceCharge.client_email || 'Cliente desconhecido'}
                </p>
                <p className="text-purple-700 text-xs mt-0.5">
                  Valor: {fmt(parseFloat(splitSourceCharge.value ?? '0'))} · Venc: {fmtDate(splitSourceCharge.due_date || splitSourceCharge.dueDate)}
                </p>
              </div>
            )}
            {!splitSourceCharge && (
              <p className="text-sm text-muted-foreground">Distribua um pagamento PIX recebido entre múltiplas cobranças.</p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Valor Total do PIX (R$)</Label>
                <Input
                  type="number" step="0.01" min="0.01"
                  placeholder="0,00"
                  value={splitForm.pixValue}
                  onChange={(e) => setSplitForm(f => ({ ...f, pixValue: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Data do Pagamento</Label>
                <Input
                  type="date"
                  value={splitForm.paymentDate}
                  onChange={(e) => setSplitForm(f => ({ ...f, paymentDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Buscar Cobranças por Cliente</Label>
              <Select value={splitClientId} onValueChange={(v) => { setSplitClientId(v); setSplitForm(f => ({ ...f, splits: [] })); }}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente..." /></SelectTrigger>
                <SelectContent>
                  {(clientsQuery.data ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {splitClientId && pendingChargesQuery.isLoading && (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            )}

            {splitClientId && !pendingChargesQuery.isLoading && (pendingChargesQuery.data ?? []).length > 0 && (
              <div className="space-y-2">
                <Label>Cobranças Pendentes/Vencidas</Label>
                {(pendingChargesQuery.data ?? []).map((c: any) => {
                  const alreadyAdded = splitForm.splits.find(s => s.chargeId === c.id);
                  return (
                    <div key={c.id} className={`flex items-center justify-between p-2 rounded border text-sm ${alreadyAdded ? 'bg-green-50 border-green-200' : 'bg-muted/30'}`}>
                      <div>
                        <p className="font-medium">{c.description || TYPE_LABELS[c.type] || c.type}</p>
                        <p className="text-xs text-muted-foreground">Venc: {fmtDate(c.dueDate || c.due_date)} · {fmt(parseFloat(c.value ?? "0"))}</p>
                      </div>
                      {alreadyAdded ? (
                        <Button size="sm" variant="ghost" className="text-xs text-red-600 h-7"
                          onClick={() => setSplitForm(f => ({ ...f, splits: f.splits.filter(s => s.chargeId !== c.id) }))}
                        >Remover</Button>
                      ) : (
                        <Button size="sm" variant="outline" className="text-xs h-7"
                          onClick={() => setSplitForm(f => ({ ...f, splits: [...f.splits, { chargeId: c.id, clientName: c.client_name || "", description: c.description || TYPE_LABELS[c.type] || c.type || `Cobrança #${c.id}`, value: parseFloat(c.value ?? "0"), chargeValue: parseFloat(c.value ?? "0"), dueDate: c.due_date || "", amount: String(c.value ?? "") }] }))}
                        >+ Adicionar</Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {splitForm.splits.length > 0 && (
              <div className="space-y-2">
                <Label>Distribuição do Split</Label>
                {splitForm.splits.map((s, idx) => (
                  <div key={s.chargeId} className="flex items-center gap-2 p-2 rounded border bg-purple-50/40">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.description || s.clientName || `Cobrança #${s.chargeId}`}</p>
                      <p className="text-xs text-muted-foreground">Venc: {fmtDate(s.dueDate)} · Total: {fmt(s.chargeValue)}</p>
                    </div>
                    <div className="w-28">
                      <Input
                        type="number" step="0.01" min="0.01"
                        className="h-7 text-xs"
                        value={s.amount}
                        onChange={(e) => setSplitForm(f => ({ ...f, splits: f.splits.map((sp, i) => i === idx ? { ...sp, amount: e.target.value } : sp) }))}
                      />
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 shrink-0"
                      onClick={() => setSplitForm(f => ({ ...f, splits: f.splits.filter((_, i) => i !== idx) }))}
                    ><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}

                {splitForm.pixValue && (
                  <div className="flex items-center justify-between text-sm p-2 rounded bg-muted/30">
                    <span>Total alocado:</span>
                    <span className={`font-semibold ${
                      Math.abs(splitForm.splits.reduce((acc, s) => acc + parseFloat(s.amount || "0"), 0) - parseFloat(splitForm.pixValue || "0")) < 0.02
                        ? 'text-green-700' : 'text-orange-700'
                    }`}>
                      {fmt(splitForm.splits.reduce((acc, s) => acc + parseFloat(s.amount || "0"), 0))}
                      {" / "}{fmt(parseFloat(splitForm.pixValue || "0"))}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowSplitDialog(false); setSplitClientId(""); setSplitForm({ pixValue: "", paymentDate: new Date().toISOString().split('T')[0], splits: [] }); }}>Cancelar</Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white"
              disabled={splitPaymentMutation.isPending || splitForm.splits.length === 0 || !splitForm.pixValue}
              onClick={() => {
                if (!splitForm.pixValue || parseFloat(splitForm.pixValue) <= 0) return toast.error("Informe o valor total do PIX");
                if (splitForm.splits.length === 0) return toast.error("Adicione ao menos uma cobrança ao split");
                const totalAllocated = splitForm.splits.reduce((acc, s) => acc + parseFloat(s.amount || "0"), 0);
                const pixTotal = parseFloat(splitForm.pixValue);
                // Permite que o total alocado seja menor que o PIX (saldo não alocado fica como tróco)
                if (totalAllocated > pixTotal + 0.02) return toast.error(`Total alocado (${fmt(totalAllocated)}) excede o PIX (${fmt(pixTotal)})`);
                if (totalAllocated < 0.01) return toast.error('Informe ao menos um valor a alocar');
                splitPaymentMutation.mutate({
                  pixValue: pixTotal,
                  paymentDate: splitForm.paymentDate,
                  sourceChargeId: splitSourceCharge?.id ?? undefined,
                  splits: splitForm.splits.map(s => ({ chargeId: s.chargeId, amount: parseFloat(s.amount || "0") })),
                });
              }}
            >
              {splitPaymentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Scissors className="h-4 w-4 mr-2" />}
              Confirmar Split
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Editar Cobrança ─── */}
      <Dialog open={!!editCharge} onOpenChange={(open) => { if (!open) setEditCharge(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Cobrança</DialogTitle>
          </DialogHeader>
          {editCharge && (
            <div className="space-y-4 py-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Cliente: <strong>{editForm.clientId
                    ? (activeClientsQuery.data?.find(c => c.id === editForm.clientId)?.name ?? "Selecionado")
                    : (editCharge.client_name ?? editCharge.client_email ?? "Desconhecido")}
                  </strong>
                </p>
              </div>

              {/* Vincular/Trocar Cliente */}
              <div className="space-y-1 border rounded-md p-3 bg-muted/30">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vincular Cliente</Label>
                <Input
                  placeholder="Buscar por nome ou email..."
                  value={editClientSearch}
                  onChange={(e) => setEditClientSearch(e.target.value)}
                  className="h-8 text-sm"
                />
                <Select
                  value={editForm.clientId ? String(editForm.clientId) : "__keep__"}
                  onValueChange={(v) => setEditForm(f => ({ ...f, clientId: v && v !== "__keep__" ? Number(v) : undefined }))}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Selecione o cliente..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    <SelectItem value="__keep__">— Manter cliente atual —</SelectItem>
                    {(activeClientsQuery.data ?? []).filter(c =>
                      editClientSearch.length < 2 ||
                      c.name.toLowerCase().includes(editClientSearch.toLowerCase()) ||
                      (c.email ?? "").toLowerCase().includes(editClientSearch.toLowerCase())
                    ).map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}{c.email ? ` — ${c.email}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select
                  value={editForm.type}
                  onValueChange={(v) => setEditForm(f => ({ ...f, type: v as any }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Mensalidade</SelectItem>
                    <SelectItem value="quota_sale">Venda de Cota</SelectItem>
                    <SelectItem value="fuel">Abastecimento</SelectItem>
                    <SelectItem value="repair">Reparo</SelectItem>
                    <SelectItem value="other">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={editForm.value}
                  onChange={(e) => setEditForm(f => ({ ...f, value: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label>Data de Vencimento</Label>
                <Input
                  type="date"
                  value={editForm.dueDate}
                  onChange={(e) => setEditForm(f => ({ ...f, dueDate: e.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label>Descrição</Label>
                <Input
                  value={editForm.description}
                  onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCharge(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!editCharge) return;
                updateChargeMutation.mutate({
                  chargeId: editCharge.id,
                  type: editForm.type,
                  value: parseFloat(editForm.value),
                  dueDate: editForm.dueDate || undefined,
                  description: editForm.description || undefined,
                  clientId: editForm.clientId,
                });
              }}
              disabled={updateChargeMutation.isPending}
            >
              {updateChargeMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Salvando...</>
              ) : (
                "Salvar Alterações"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Dialog: Resultado do PIX Individual ─── */}
      <Dialog open={!!pixLinkResult} onOpenChange={(open) => { if (!open) { setPixLinkResult(null); setPixLinkCharge(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-violet-600">PIX</span> Link de Pagamento Gerado
            </DialogTitle>
          </DialogHeader>
          {pixLinkResult && (
            <div className="space-y-4 py-2">
              {pixLinkCharge && (
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium">{pixLinkCharge.client_name ?? pixLinkCharge.clientName}</span>
                  {' — '}
                  {fmt(parseFloat(pixLinkCharge.value ?? '0'))}
                  {' — Venc. '}{fmtDate(pixLinkCharge.due_date ?? pixLinkCharge.dueDate)}
                </div>
              )}
              {pixLinkResult.reused && (
                <div className="text-xs text-amber-600 bg-amber-50 rounded px-3 py-1.5">
                  Link existente reutilizado (cobrança já tinha PIX ativo no Asaas)
                </div>
              )}
              {pixLinkResult.pixQrCode && (
                <div className="flex justify-center">
                  <img
                    src={`data:image/png;base64,${pixLinkResult.pixQrCode}`}
                    alt="QR Code PIX"
                    className="w-48 h-48 border rounded"
                  />
                </div>
              )}
              {pixLinkResult.pixPayload && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Código PIX Copia e Cola:</p>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={pixLinkResult.pixPayload}
                      className="text-xs font-mono"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(pixLinkResult.pixPayload);
                        toast.success('Código PIX copiado!');
                      }}
                    >
                      Copiar
                    </Button>
                  </div>
                </div>
              )}
              {pixLinkResult.invoiceUrl && (
                <a
                  href={pixLinkResult.invoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-sm text-violet-600 underline hover:text-violet-800"
                >
                  Abrir fatura no Asaas →
                </a>
              )}
              {!pixLinkResult.pixPayload && !pixLinkResult.invoiceUrl && (
                <p className="text-sm text-muted-foreground text-center">
                  PIX criado no Asaas (ID: {pixLinkResult.asaasChargeId})<br/>
                  O QR Code estará disponível em instantes.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPixLinkResult(null); setPixLinkCharge(null); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Card de cobrança não classificada ───────────────────────────────────────

function UnclassifiedChargeCard({
  charge,
  onClassify,
  loading,
  onLinkClient,
  linkLoading,
  activeClients,
  onSplit,
}: {
  charge: any;
  onClassify: (type: string) => void;
  loading: boolean;
  onLinkClient: (clientId: number) => void;
  linkLoading: boolean;
  activeClients: Array<{ id: number; name: string; email: string }>;
  onSplit?: () => void;
}) {
  const [selectedType, setSelectedType] = useState("");
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [clientSearch, setClientSearch] = useState("");

  const isUnknown = !charge.clientName && !charge.client_name && !charge.clientEmail && !charge.client_email;
  const displayName = charge.clientName || charge.client_name || charge.clientEmail || charge.client_email || null;

  // Dados de sugestão vindos do backend
  const suggestion = charge.suggestedClient as {
    clientId: number; clientName: string; clientEmail: string; confidence: number;
  } | null;
  const possibleMatch = charge.possibleMatch as {
    clientId: number; clientName: string; clientEmail: string;
    matchType: string; matchValue: string; matchDate: string;
  } | null;

  const filteredClients = activeClients.filter(c =>
    clientSearch.length < 2 ||
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.email.toLowerCase().includes(clientSearch.toLowerCase())
  );

  function handleLinkConfirm() {
    if (!selectedClientId) return;
    onLinkClient(Number(selectedClientId));
    setShowLinkDialog(false);
    setSelectedClientId("");
    setClientSearch("");
  }

  return (
    <>
      <Card className="border-yellow-200 bg-yellow-50/30">
        <CardContent className="py-3 px-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-sm">
                  {displayName ?? "Cliente desconhecido"}
                </p>
                {/* Badge de sugestão por nome na descrição */}
                {isUnknown && suggestion && (
                  <Badge className="text-xs bg-blue-100 text-blue-800 border-blue-200 cursor-pointer hover:bg-blue-200"
                    onClick={() => {
                      setSelectedClientId(String(suggestion.clientId));
                      setShowLinkDialog(true);
                    }}
                  >
                    Sugestão: {suggestion.clientName} ({suggestion.confidence}%)
                  </Badge>
                )}
                {/* Badge de match por valor+data */}
                {isUnknown && !suggestion && possibleMatch && (
                  <Badge className="text-xs bg-purple-100 text-purple-800 border-purple-200 cursor-pointer hover:bg-purple-200"
                    onClick={() => {
                      setSelectedClientId(String(possibleMatch.clientId));
                      setShowLinkDialog(true);
                    }}
                  >
                    Possível match: {possibleMatch.clientName} — {TYPE_LABELS[possibleMatch.matchType as keyof typeof TYPE_LABELS] ?? possibleMatch.matchType} {fmt(parseFloat(possibleMatch.matchValue))} venc. {possibleMatch.matchDate}
                  </Badge>
                )}
              </div>
              {charge.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{charge.description}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Venc: {fmtDate(charge.due_date || charge.dueDate)} · Status: {charge.status}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <p className="font-semibold text-sm">
                {fmt(parseFloat(charge.value ?? "0"))}
              </p>
              {isUnknown && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 border-blue-300 text-blue-700 hover:bg-blue-50"
                  onClick={() => setShowLinkDialog(true)}
                >
                  Vincular Cliente
                </Button>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap items-center">
            {Object.entries(TYPE_LABELS).map(([v, l]) => (
              <Button
                key={v}
                variant={selectedType === v ? "default" : "outline"}
                size="sm"
                className="text-xs h-7"
                onClick={() => setSelectedType(v)}
                disabled={loading}
              >
                {l}
              </Button>
            ))}
            {selectedType && (
              <Button
                size="sm"
                className="text-xs h-7"
                onClick={() => onClassify(selectedType)}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                )}
                Classificar
              </Button>
            )}
            {onSplit && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-7 ml-auto text-purple-700 border-purple-300 hover:bg-purple-50"
                onClick={onSplit}
              >
                <Scissors className="h-3 w-3 mr-1" />
                Distribuir como Split
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dialog: Vincular Cliente */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Vincular Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="p-3 bg-muted rounded-md text-sm space-y-1">
              <p><span className="font-medium">Descrição:</span> {charge.description || "(sem descrição)"}</p>
              <p><span className="font-medium">Valor:</span> {fmt(parseFloat(charge.value ?? "0"))}</p>
              <p><span className="font-medium">Vencimento:</span> {fmtDate(charge.due_date || charge.dueDate)}</p>
              <p><span className="font-medium">Status:</span> {charge.status}</p>
            </div>
            <div className="space-y-1">
              <Label>Buscar cliente</Label>
              <Input
                placeholder="Digite nome ou email..."
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Selecionar cliente</Label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o cliente..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {filteredClients.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name} — {c.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowLinkDialog(false); setSelectedClientId(""); setClientSearch(""); }}>
              Cancelar
            </Button>
            <Button
              onClick={handleLinkConfirm}
              disabled={!selectedClientId || linkLoading}
            >
              {linkLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Vincular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

//// ─── DRE por Embarcação ─────────────────────────────────────────────────

function DREByVesselView({ data, vesselName }: { data: any; vesselName?: string }) {
  if (!data) return (
    <div className="text-center py-12 text-muted-foreground">
      <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
      <p>Nenhum dado disponível para o período selecionado</p>
    </div>
  );

  const netPositive = data.netResult >= 0;

  return (
    <div className="space-y-6">
      {/* Título da embarcação selecionada */}
      {vesselName && (
        <div className="flex items-center gap-2 pb-1 border-b">
          <Activity className="h-4 w-4 text-teal-600" />
          <span className="font-semibold text-base text-teal-700">{vesselName}</span>
          <span className="text-xs text-muted-foreground ml-1">DRE por embarcação</span>
        </div>
      )}

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-green-200 bg-green-50/40">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <p className="text-sm font-medium text-green-800">Receita Realizada</p>
            </div>
            <p className="text-2xl font-bold text-green-700">{fmt(data.totalRevenue)}</p>
            <p className="text-xs text-green-600 mt-1">Previsto: {fmt(data.totalExpected)}</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-red-600" />
              <p className="text-sm font-medium text-red-800">Despesas Pagas</p>
            </div>
            <p className="text-2xl font-bold text-red-700">{fmt(data.totalExpenses)}</p>
            <p className="text-xs text-red-600 mt-1">Previsto: {fmt(data.totalExpensesAll)}</p>
          </CardContent>
        </Card>
        <Card className={netPositive ? "border-blue-200 bg-blue-50/40" : "border-orange-200 bg-orange-50/40"}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className={`h-4 w-4 ${netPositive ? "text-blue-600" : "text-orange-600"}`} />
              <p className={`text-sm font-medium ${netPositive ? "text-blue-800" : "text-orange-800"}`}>Resultado Líquido</p>
            </div>
            <p className={`text-2xl font-bold ${netPositive ? "text-blue-700" : "text-orange-700"}`}>{fmt(data.netResult)}</p>
            <p className={`text-xs mt-1 ${netPositive ? "text-blue-600" : "text-orange-600"}`}>
              Margem: {data.margin.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Receitas por tipo na embarcação */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Receitas da Embarcação
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.revenueByVessel.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sem receitas no período</p>
            ) : data.revenueByVessel.map((r: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">{r.typeLabel ?? r.vesselName}</p>
                  <p className="text-xs text-muted-foreground">{r.count} cobrança(s)</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-green-700">{fmt(r.received)}</p>
                  {r.expected !== r.received && (
                    <p className="text-xs text-muted-foreground">Prev: {fmt(r.expected)}</p>
                  )}
                </div>
              </div>
            ))}
            <div className="flex justify-between pt-2 font-semibold border-t">
              <span className="text-sm">Total Receitas</span>
              <span className="text-sm text-green-700">{fmt(data.totalRevenue)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Despesas por centro de custo (globais) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              Despesas por Centro de Custo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.expenses.byCenter.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sem despesas no período</p>
            ) : data.expenses.byCenter.map((e: any) => (
              <div key={e.costCenter} className="flex items-center justify-between py-1.5 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">{e.label}</p>
                  <p className="text-xs text-muted-foreground">{e.count} despesa(s)</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-red-700">{fmt(e.paid)}</p>
                  {e.total !== e.paid && (
                    <p className="text-xs text-muted-foreground">Prev: {fmt(e.total)}</p>
                  )}
                </div>
              </div>
            ))}
            <div className="flex justify-between pt-2 font-semibold border-t">
              <span className="text-sm">Total Despesas</span>
              <span className="text-sm text-red-700">{fmt(data.totalExpenses)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── DRE Consolidado ─────────────────────────────────────────────────

function DREView({ data }: { data: any }) {
  if (!data) return (
    <div className="text-center py-12 text-muted-foreground">
      <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
      <p>Nenhum dado disponível para o período selecionado</p>
    </div>
  );

  const netPositive = data.netResult >= 0;

  return (
    <div className="space-y-6">
      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-green-200 bg-green-50/40">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <p className="text-sm font-medium text-green-800">Receita Realizada</p>
            </div>
            <p className="text-2xl font-bold text-green-700">{fmt(data.revenue.total)}</p>
            <p className="text-xs text-green-600 mt-1">Previsto: {fmt(data.revenue.expected)}</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-red-600" />
              <p className="text-sm font-medium text-red-800">Despesas Pagas</p>
            </div>
            <p className="text-2xl font-bold text-red-700">{fmt(data.expenses.total)}</p>
            <p className="text-xs text-red-600 mt-1">Previsto: {fmt(data.expenses.totalAll)}</p>
          </CardContent>
        </Card>
        <Card className={netPositive ? "border-blue-200 bg-blue-50/40" : "border-orange-200 bg-orange-50/40"}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className={`h-4 w-4 ${netPositive ? "text-blue-600" : "text-orange-600"}`} />
              <p className={`text-sm font-medium ${netPositive ? "text-blue-800" : "text-orange-800"}`}>Resultado Líquido</p>
            </div>
            <p className={`text-2xl font-bold ${netPositive ? "text-blue-700" : "text-orange-700"}`}>{fmt(data.netResult)}</p>
            <p className={`text-xs mt-1 ${netPositive ? "text-blue-600" : "text-orange-600"}`}>
              Margem: {data.margin.toFixed(1)}%
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Receitas por tipo */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Receitas por Categoria
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.revenue.byType.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sem receitas no período</p>
            ) : data.revenue.byType.map((r: any) => (
              <div key={r.type} className="flex items-center justify-between py-1.5 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">{r.label}</p>
                  <p className="text-xs text-muted-foreground">{r.count} cobrança(s)</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-green-700">{fmt(r.received)}</p>
                  {r.expected !== r.received && (
                    <p className="text-xs text-muted-foreground">Prev: {fmt(r.expected)}</p>
                  )}
                </div>
              </div>
            ))}
            <div className="flex justify-between pt-2 font-semibold border-t">
              <span className="text-sm">Total Receitas</span>
              <span className="text-sm text-green-700">{fmt(data.revenue.total)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Despesas por centro de custo */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              Despesas por Centro de Custo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.expenses.byCenter.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sem despesas no período</p>
            ) : data.expenses.byCenter.map((e: any) => (
              <div key={e.costCenter} className="flex items-center justify-between py-1.5 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">{e.label}</p>
                  <p className="text-xs text-muted-foreground">{e.count} despesa(s)</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-red-700">{fmt(e.paid)}</p>
                  {e.total !== e.paid && (
                    <p className="text-xs text-muted-foreground">Prev: {fmt(e.total)}</p>
                  )}
                </div>
              </div>
            ))}
            <div className="flex justify-between pt-2 font-semibold border-t">
              <span className="text-sm">Total Despesas</span>
              <span className="text-sm text-red-700">{fmt(data.expenses.total)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Reconciliação ───────────────────────────────────────────────────────────

function ReconciliationView({ data }: { data: any }) {
  if (!data) return (
    <div className="text-center py-12 text-muted-foreground">
      <GitCompare className="h-12 w-12 mx-auto mb-3 opacity-30" />
      <p>Carregando dados de reconciliação...</p>
    </div>
  );

  const STATUS_LABELS_RECON: Record<string, string> = {
    pending: "Pendente", overdue: "Vencido", received: "Recebido",
    confirmed: "Confirmado", receivedInCash: "Pago (Cash)",
    refunded: "Estornado", cancelled: "Cancelado",
  };

  return (
    <div className="space-y-6">
      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {data.statusStats.map((s: any) => (
          <Card key={s.status}>
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground">{STATUS_LABELS_RECON[s.status] ?? s.status}</p>
              <p className="text-lg font-bold">{s.count}</p>
              <p className="text-xs text-muted-foreground">{fmt(s.total)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Divergências */}
      {data.totalDivergent > 0 && (
        <Card className="border-orange-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-orange-700">
              <AlertTriangle className="h-4 w-4" />
              {data.totalDivergent} Cobrança(s) com Divergência (sem sync há 7+ dias)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.divergentCharges.map((c: any) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">{c.clientName || "—"}</p>
                  <p className="text-xs text-muted-foreground font-mono">{c.asaasChargeId}</p>
                  <p className="text-xs text-muted-foreground">Venc: {fmtDate(c.dueDate)} · Último sync: {c.syncedAt ? new Date(c.syncedAt).toLocaleDateString("pt-BR") : "Nunca"}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{fmt(c.value)}</p>
                  <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-800">{STATUS_LABELS_RECON[c.status] ?? c.status}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Cobranças pendentes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-yellow-600" />
            {data.totalPending} Cobrança(s) Pendentes/Vencidas (últimos 90 dias)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.pendingCharges.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500 opacity-60" />
              <p className="text-sm">Nenhuma cobrança pendente</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {data.pendingCharges.map((c: any) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">{c.clientName || c.clientEmail || "—"}</p>
                    <p className="text-xs text-muted-foreground">Venc: {fmtDate(c.dueDate)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{fmt(c.value)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded ${c.status === "overdue" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}`}>
                      {STATUS_LABELS_RECON[c.status] ?? c.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Aba Despesas ─────────────────────────────────────────────────────────────

const COST_CENTER_LABELS: Record<string, string> = {
  salary: "Salários", rent: "Aluguéis", pro_labore: "Pró-labore",
  fuel_operational: "Combustível (Op.)", repair: "Reparos",
  operational: "Custo Operacional", withdrawal: "Saque / Retirada", other: "Outros",
};

const EXPENSE_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "bg-yellow-100 text-yellow-800" },
  paid:    { label: "Pago",     color: "bg-green-100 text-green-800" },
  overdue: { label: "Vencido",  color: "bg-red-100 text-red-800" },
};

const PER_PAGE_EXPENSES = 50;

function ExpensesTab() {
  const [expYear, setExpYear] = useState("all");
  const [expMonth, setExpMonth] = useState("all");
  const [expCostCenter, setExpCostCenter] = useState("all");
  const [expPage, setExpPage] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    costCenter: "operational", description: "", recipientName: "",
    value: "", dueDate: "", status: "pending", notes: "",
  });

  // Estado do dialog de edição
  const [editingExpense, setEditingExpense] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    costCenter: "operational", description: "", recipientName: "",
    value: "", dueDate: "", paidDate: "", status: "pending", notes: "",
  });

  const utils = trpc.useUtils();

  const expensesQuery = trpc.expenses.list.useQuery(
    {
      year: expYear !== "all" ? expYear : undefined,
      month: expMonth !== "all" ? expMonth.padStart(2, "0") : undefined,
      costCenter: expCostCenter !== "all" ? (expCostCenter as any) : "all",
      limit: PER_PAGE_EXPENSES,
      offset: expPage * PER_PAGE_EXPENSES,
    },
    { refetchOnWindowFocus: false }
  );
  const expenseStatsQuery = trpc.expenses.stats.useQuery(
    {
      year: expYear !== "all" ? expYear : undefined,
      month: expMonth !== "all" ? expMonth.padStart(2, "0") : undefined,
      costCenter: expCostCenter !== "all" ? (expCostCenter as any) : "all",
    },
    { refetchOnWindowFocus: false }
  );

  const importFromAsaasMutation = trpc.expenses.importFromAsaas.useMutation({
    onSuccess: (data) => {
      toast.success(`Importação concluída: ${data.imported} despesa(s) inserida(s)`);
      utils.expenses.list.invalidate();
      utils.expenses.stats.invalidate();
    },
    onError: (err) => toast.error(`Erro na importação: ${err.message}`),
  });

  const createMutation = trpc.expenses.create.useMutation({
    onSuccess: () => {
      toast.success("Despesa criada com sucesso");
      utils.expenses.list.invalidate();
      utils.expenses.stats.invalidate();
      setShowForm(false);
      setForm({ costCenter: "operational", description: "", recipientName: "", value: "", dueDate: "", status: "pending", notes: "" });
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const markPaidMutation = trpc.expenses.markAsPaid.useMutation({
    onSuccess: () => {
      toast.success("Despesa marcada como paga");
      utils.expenses.list.invalidate();
      utils.expenses.stats.invalidate();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const deleteMutation = trpc.expenses.delete.useMutation({
    onSuccess: () => {
      toast.success("Despesa excluída");
      utils.expenses.list.invalidate();
      utils.expenses.stats.invalidate();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const updateMutation = trpc.expenses.update.useMutation({
    onSuccess: () => {
      toast.success("Despesa atualizada com sucesso");
      utils.expenses.list.invalidate();
      utils.expenses.stats.invalidate();
      setEditingExpense(null);
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const autoClassifyMutationExp = trpc.expenses.autoClassify.useMutation({
    onSuccess: (data) => {
      toast.success(`Classificação automática: ${data.updated} despesa(s) classificada(s)`);
      utils.expenses.list.invalidate();
      utils.expenses.stats.invalidate();
    },
    onError: (err) => toast.error(`Erro: ${err.message}`),
  });

  const openEdit = (exp: any) => {
    setEditingExpense(exp);
    setEditForm({
      costCenter: exp.costCenter ?? "operational",
      description: exp.description ?? "",
      recipientName: exp.recipientName ?? "",
      value: String(exp.value ?? ""),
      dueDate: exp.dueDate ?? "",
      paidDate: exp.paidDate ?? "",
      status: exp.status ?? "pending",
      notes: exp.notes ?? "",
    });
  };

  const stats = expenseStatsQuery.data;
  const expenses = expensesQuery.data?.items ?? [];
  const totalExpenses = expensesQuery.data?.total ?? 0;
  const totalPages = Math.ceil(totalExpenses / PER_PAGE_EXPENSES);

  // Reset page when filters change
  const resetPage = () => setExpPage(0);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <Select value={expYear} onValueChange={v => { setExpYear(v); resetPage(); }}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os anos</SelectItem>
              {["2025","2026","2027"].map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={expMonth} onValueChange={v => { setExpMonth(v); resetPage(); }}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={expCostCenter} onValueChange={v => { setExpCostCenter(v); resetPage(); }}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Centro de Custo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os centros</SelectItem>
              <SelectItem value="salary">Salários</SelectItem>
              <SelectItem value="rent">Aluguéis</SelectItem>
              <SelectItem value="pro_labore">Pró-labore</SelectItem>
              <SelectItem value="fuel_operational">Combustível (Op.)</SelectItem>
              <SelectItem value="repair">Reparos</SelectItem>
              <SelectItem value="operational">Custo Operacional</SelectItem>
              <SelectItem value="withdrawal">Saque / Retirada</SelectItem>
              <SelectItem value="other">Outros</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={() => autoClassifyMutationExp.mutate({ onlyUnclassified: true })}
            disabled={autoClassifyMutationExp.isPending}
          >
            {autoClassifyMutationExp.isPending
              ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
              : <Wand2 className="h-4 w-4 mr-2" />}
            Classificar Automaticamente
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => importFromAsaasMutation.mutate()}
            disabled={importFromAsaasMutation.isPending}
          >
            {importFromAsaasMutation.isPending
              ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
              : <Download className="h-4 w-4 mr-2" />}
            Importar do Asaas
          </Button>
          <Button size="sm" onClick={() => setShowForm(v => !v)}>
            {showForm ? "Cancelar" : "+ Nova Despesa"}
          </Button>
        </div>
      </div>

      {/* Cards de stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground">Total Previsto</p>
              <p className="text-lg font-bold">{fmt(parseFloat(String(stats.totalAll ?? 0)))}</p>
            </CardContent>
          </Card>
          <Card className="border-green-200">
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground">Total Pago</p>
              <p className="text-lg font-bold text-green-700">{fmt(parseFloat(String(stats.totalPaid ?? 0)))}</p>
            </CardContent>
          </Card>
          <Card className="border-yellow-200">
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground">Pendente</p>
              <p className="text-lg font-bold text-yellow-700">{fmt(parseFloat(String(stats.totalPending ?? 0)))}</p>
            </CardContent>
          </Card>
          <Card className="border-red-200">
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground">Vencido</p>
              <p className="text-lg font-bold text-red-700">{fmt(parseFloat(String(stats.totalOverdue ?? 0)))}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Formulário de nova despesa */}
      {showForm && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Nova Despesa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1 block">Centro de Custo *</label>
                <Select value={form.costCenter} onValueChange={v => setForm(f => ({ ...f, costCenter: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(COST_CENTER_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Descrição *</label>
                <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Ex: Aluguel do galpão" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Fornecedor / Beneficiário</label>
                <Input value={form.recipientName} onChange={e => setForm(f => ({ ...f, recipientName: e.target.value }))} placeholder="Nome do fornecedor" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Valor (R$) *</label>
                <Input type="number" step="0.01" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="0,00" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Vencimento *</label>
                <Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Status</label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="paid">Pago</SelectItem>
                    <SelectItem value="overdue">Vencido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Observações</label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Observações opcionais" />
            </div>
            <Button
              onClick={() => {
                if (!form.description || !form.value || !form.dueDate) {
                  toast.error("Preencha os campos obrigatórios: Descrição, Valor e Vencimento");
                  return;
                }
                createMutation.mutate({
                  costCenter: form.costCenter as any,
                  description: form.description,
                  recipientName: form.recipientName || undefined,
                  value: parseFloat(form.value),
                  dueDate: form.dueDate,
                  status: form.status as any,
                  notes: form.notes || undefined,
                });
              }}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar Despesa
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Lista de despesas */}
      {expensesQuery.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : expenses.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Receipt className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhuma despesa no período</p>
          <p className="text-sm">Clique em "+ Nova Despesa" para adicionar</p>
        </div>
      ) : (
        <>
        <div className="text-sm text-muted-foreground mb-2">
          {totalExpenses} despesa(s) encontrada(s){totalPages > 1 ? ` — página ${expPage + 1} de ${totalPages}` : ""}
        </div>
        <div className="space-y-2">
          {expenses.map((exp: any) => {
            const st = EXPENSE_STATUS_LABELS[exp.status] ?? { label: exp.status, color: "bg-gray-100 text-gray-700" };
            return (
              <Card key={exp.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{exp.description}</p>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
                        <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700">
                          {COST_CENTER_LABELS[exp.costCenter] ?? exp.costCenter}
                        </span>
                      </div>
                      {exp.recipientName && <p className="text-xs text-muted-foreground">{exp.recipientName}</p>}
                      <p className="text-xs text-muted-foreground">Venc: {fmtDate(exp.dueDate)}{exp.paidDate ? ` · Pago: ${fmtDate(exp.paidDate)}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{fmt(parseFloat(String(exp.value ?? 0)))}</p>
                      {exp.status !== "paid" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => markPaidMutation.mutate({ id: exp.id })}
                          disabled={markPaidMutation.isPending}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />Dar Baixa
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => openEdit(exp)}
                      >
                        <Pencil className="h-3 w-3 mr-1" />Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 text-red-600 hover:text-red-700"
                        onClick={() => {
                          if (confirm("Excluir esta despesa?")) deleteMutation.mutate({ id: exp.id });
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        Excluir
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        </>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpPage(p => Math.max(0, p - 1))}
            disabled={expPage === 0 || expensesQuery.isLoading}
          >
            ← Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {expPage + 1} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={expPage >= totalPages - 1 || expensesQuery.isLoading}
          >
            Próxima →
          </Button>
        </div>
      )}

      {/* ── Dialog de edição de despesa ── */}
      {editingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b flex items-center justify-between">
              <h2 className="font-semibold text-base">Editar Despesa</h2>
              <button onClick={() => setEditingExpense(null)} className="text-muted-foreground hover:text-foreground text-xl leading-none">&times;</button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1 block">Centro de Custo *</label>
                  <Select value={editForm.costCenter} onValueChange={v => setEditForm(f => ({ ...f, costCenter: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(COST_CENTER_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Status</label>
                  <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendente</SelectItem>
                      <SelectItem value="paid">Pago</SelectItem>
                      <SelectItem value="overdue">Vencido</SelectItem>
                      <SelectItem value="cancelled">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium mb-1 block">Descrição *</label>
                  <Input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Fornecedor / Beneficiário</label>
                  <Input value={editForm.recipientName} onChange={e => setEditForm(f => ({ ...f, recipientName: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Valor (R$) *</label>
                  <Input type="number" step="0.01" value={editForm.value} onChange={e => setEditForm(f => ({ ...f, value: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Vencimento</label>
                  <Input type="date" value={editForm.dueDate} onChange={e => setEditForm(f => ({ ...f, dueDate: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Data de Pagamento</label>
                  <Input type="date" value={editForm.paidDate} onChange={e => setEditForm(f => ({ ...f, paidDate: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block">Observações</label>
                <Input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} placeholder="Observações opcionais" />
              </div>
              {editingExpense.manuallyClassified && (
                <p className="text-xs text-teal-700 bg-teal-50 px-3 py-1.5 rounded">
                  ✓ Centro de custo classificado manualmente — não será sobrescrito pela classificação automática
                </p>
              )}
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setEditingExpense(null)}>Cancelar</Button>
                <Button
                  onClick={() => {
                    if (!editForm.description || !editForm.value || !editForm.dueDate) {
                      toast.error("Preencha Descrição, Valor e Vencimento");
                      return;
                    }
                    updateMutation.mutate({
                      id: editingExpense.id,
                      fields: {
                        costCenter: editForm.costCenter as any,
                        description: editForm.description,
                        recipientName: editForm.recipientName || null,
                        value: parseFloat(editForm.value),
                        dueDate: editForm.dueDate,
                        paidDate: editForm.paidDate || null,
                        status: editForm.status as any,
                        notes: editForm.notes || null,
                      },
                    });
                  }}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Salvar Alterações
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

