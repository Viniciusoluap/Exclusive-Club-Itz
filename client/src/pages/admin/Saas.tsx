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
  CheckCircle2, Loader2, RotateCcw
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
        <TabsList>
          <TabsTrigger value="charges">Cobranças</TabsTrigger>
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
