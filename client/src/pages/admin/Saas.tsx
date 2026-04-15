import { useState, useMemo } from "react";
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
  GitCompare, Receipt, TrendingDown, Activity, AlertCircle
} from "lucide-react";

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
  other:      "Outros",
};

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? { label: status, color: "bg-gray-100 text-gray-700" };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>
      {s.label}
    </span>
  );
}

const YEARS = ["Todos os anos", "2024", "2025", "2026", "2027"];
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
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [monthFilter, setMonthFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const queryFilters = useMemo(() => ({
    status: statusFilter !== "all" ? statusFilter : undefined,
    type: typeFilter !== "all" ? typeFilter : undefined,
    year: yearFilter !== "Todos os anos" ? yearFilter : undefined,
    month: monthFilter !== "all" ? monthFilter : undefined,
    search: search || undefined,
  }), [statusFilter, typeFilter, yearFilter, monthFilter, search]);

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
  const dreQuery = trpc.bpo.getDRE.useQuery(
    { year: dreYear, month: dreMonth !== "all" ? dreMonth : undefined },
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

  const stats = statsQuery.data;
  const charges = chargesQuery.data?.items ?? [];
  const totalCharges = chargesQuery.data?.total ?? 0;
  const totalPages = Math.ceil(totalCharges / PAGE_SIZE);

  function clearFilters() {
    setStatusFilter("all");
    setTypeFilter("all");
    setYearFilter(String(new Date().getFullYear()));
    setMonthFilter("all");
    setSearch("");
    setPage(0);
  }

  const hasFilters =
    statusFilter !== "all" ||
    typeFilter !== "all" ||
    yearFilter !== String(new Date().getFullYear()) ||
    monthFilter !== "all" ||
    search !== "";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">BPO Financeiro</h1>
          <p className="text-sm text-muted-foreground">Gestão de pagamentos e recebimentos</p>
        </div>
        <div className="flex gap-2 flex-wrap">
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
      </div>

      {/* Cards de totais */}
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

              {/* Busca + Mês + Ano */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                          Venc: {charge.due_date}
                          {charge.paid_date && ` · Pago: ${charge.paid_date}`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold">{fmt(parseFloat(charge.value ?? "0"))}</p>
                        {charge.amount_paid &&
                          parseFloat(charge.amount_paid) > 0 &&
                          parseFloat(charge.amount_paid) !== parseFloat(charge.value) && (
                            <p className="text-xs text-muted-foreground">
                              Pago: {fmt(parseFloat(charge.amount_paid))}
                            </p>
                          )}
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
            <Button variant="outline" size="sm" onClick={() => dreQuery.refetch()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />Atualizar
            </Button>
          </div>
          {dreQuery.isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
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
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Card de cobrança não classificada ───────────────────────────────────────

function UnclassifiedChargeCard({
  charge,
  onClassify,
  loading,
}: {
  charge: any;
  onClassify: (type: string) => void;
  loading: boolean;
}) {
  const [selectedType, setSelectedType] = useState("");

  return (
    <Card className="border-yellow-200 bg-yellow-50/30">
      <CardContent className="py-3 px-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
          <div>
            <p className="font-medium text-sm">
              {charge.client_name || charge.client_email || "Cliente desconhecido"}
            </p>
            {charge.description && (
              <p className="text-xs text-muted-foreground">{charge.description}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Venc: {charge.due_date} · Status: {charge.status}
            </p>
          </div>
          <p className="font-semibold text-sm shrink-0">
            {fmt(parseFloat(charge.value ?? "0"))}
          </p>
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
              className="text-xs h-7 ml-auto"
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
        </div>
      </CardContent>
    </Card>
  );
}

// ─── DRE Consolidado ─────────────────────────────────────────────────────────

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
                  <p className="text-xs text-muted-foreground">Venc: {c.dueDate} · Último sync: {c.syncedAt ? new Date(c.syncedAt).toLocaleDateString("pt-BR") : "Nunca"}</p>
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
                    <p className="text-xs text-muted-foreground">Venc: {c.dueDate}</p>
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
  operational: "Custo Operacional", other: "Outros",
};

const EXPENSE_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "bg-yellow-100 text-yellow-800" },
  paid:    { label: "Pago",     color: "bg-green-100 text-green-800" },
  overdue: { label: "Vencido",  color: "bg-red-100 text-red-800" },
};

function ExpensesTab() {
  const [expYear, setExpYear] = useState(String(new Date().getFullYear()));
  const [expMonth, setExpMonth] = useState(String(new Date().getMonth() + 1));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    costCenter: "operational", description: "", recipientName: "",
    value: "", dueDate: "", status: "pending", notes: "",
  });

  const utils = trpc.useUtils();

  const expensesQuery = trpc.expenses.list.useQuery(
    { year: expYear, month: expMonth.padStart(2, "0") },
    { refetchOnWindowFocus: false }
  );
  const expenseStatsQuery = trpc.expenses.stats.useQuery(
    { year: expYear, month: expMonth.padStart(2, "0") },
    { refetchOnWindowFocus: false }
  );

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

  const stats = expenseStatsQuery.data;
  const expenses = expensesQuery.data?.items ?? [];

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2">
          <Select value={expYear} onValueChange={setExpYear}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["2024","2025","2026","2027"].map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={expMonth} onValueChange={setExpMonth}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.filter(m => m.value !== "all").map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={() => setShowForm(v => !v)}>
          {showForm ? "Cancelar" : "+ Nova Despesa"}
        </Button>
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
                      <p className="text-xs text-muted-foreground">Venc: {exp.dueDate}{exp.paidDate ? ` · Pago: ${exp.paidDate}` : ""}</p>
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
      )}
    </div>
  );
}
